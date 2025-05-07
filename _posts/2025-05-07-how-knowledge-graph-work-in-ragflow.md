---

date: 2025-05-07T10:22:25+0800
title: 在RAGFlow中知识图谱是如何工作的
layout: post

---

我之前比较好奇，RAG领域里面，知识图谱是如何工作的。主要是它的组织结构，以及搜索中如何利用。

正好 Ragflow 中用到了，可以看一下他的代码，再结合测试中打印日志，了解一下知识图谱的工作原理。

目前 Ragflow 的版本是 0.18.0。

那从两个方面来讲，一个是知识图谱的创建，组织结构（和存储），另一个是知识图谱的搜索。

# 知识图谱的创建

用户新添加一篇文档之后，task_executor 开始先解析文件，创建chunks并写入向量库（我们是使用的ES）。

文件解析完之后，会调用[queue_raptor_o_graphrag_tasks](https://github.com/infiniflow/ragflow/blob/0.18.0/api/db/services/document_service.py#L424)触发知识图谱的任务。

然后到 [run_graphrag](https://github.com/infiniflow/ragflow/blob/0.18.0/graphrag/general/index.py#L41) 开始创建知识图谱。

大的步骤有两个：generate_subgraph -> merge_subgraph

generate_subgraph 是创建这个新文档的graph，merge_subgraph 再将这个graph合并到整个库的知识图谱中。

```python
subgraph = await generate_subgraph(
    LightKGExt
    if row["kb_parser_config"]["graphrag"]["method"] != "general"
    else GeneralKGExt,
    tenant_id,
    kb_id,
    doc_id,
    chunks,
    language,
    row["kb_parser_config"]["graphrag"]["entity_types"],
    chat_model,
    embedding_model,
    callback,
)

# ...

new_graph = await merge_subgraph(
    tenant_id,
    kb_id,
    doc_id,
    subgraph,
    embedding_model,
    callback,
)
```

核心是 generate_subgraph，来细看一下:

1. 初始化一个 Extractor 实例，参数 entity_types 是界面上配置的。 Extractor 实现了 `__call__` 方法。(Extractor 有两个实现，分别是 GeneralKGExt 和 LightKGExt，前者是通用的，后者是轻量级的，但我感觉好像没有大的区别)
2. 调用 [\__call__](https://github.com/infiniflow/ragflow/blob/0.18.0/graphrag/general/extractor.py#L89)，返回了所有节点和边，用来创建 subgraph。

`__call__` 里面最核心的是 [\_process_single_content](https://github.com/infiniflow/ragflow/blob/0.18.0/graphrag/general/graph_extractor.py#L100)

每一个 chunk 都会调用 \_process_single_content 来处理，并将结果都存储到 out_results 里面。

\_process_single_content 里面提取知识图谱是使用 LLM 来做的，我把 prompt 来贴一下：

```
-Goal-
Given a text document that is potentially relevant to this activity and a list of entity types, identify all entities of those types from the text and all relationships among the identified entities.

-Steps-
1. Identify all entities. For each identified entity, extract the following information:
- entity_name: Name of the entity, capitalized, in language of 'Text'
- entity_type: One of the following types: [{entity_types}]
- entity_description: Comprehensive description of the entity's attributes and activities in language of 'Text'
Format each entity as ("entity"{tuple_delimiter}<entity_name>{tuple_delimiter}<entity_type>{tuple_delimiter}<entity_description>

2. From the entities identified in step 1, identify all pairs of (source_entity, target_entity) that are *clearly related* to each other.
For each pair of related entities, extract the following information:
- source_entity: name of the source entity, as identified in step 1
- target_entity: name of the target entity, as identified in step 1
- relationship_description: explanation as to why you think the source entity and the target entity are related to each other in language of 'Text'
- relationship_strength: a numeric score indicating strength of the relationship between the source entity and target entity
 Format each relationship as ("relationship"{tuple_delimiter}<source_entity>{tuple_delimiter}<target_entity>{tuple_delimiter}<relationship_description>{tuple_delimiter}<relationship_strength>)

3. Return output as a single list of all the entities and relationships identified in steps 1 and 2. Use **{record_delimiter}** as the list delimiter.

4. When finished, output {completion_delimiter}

######################
-Examples-
######################
Example 1:

Entity_types: [person, technology, mission, organization, location]
Text:
while Alex clenched his jaw, the buzz of frustration dull against the backdrop of Taylor's authoritarian certainty. It was this competitive undercurrent that kept him alert, the sense that his and Jordan's shared commitment to discovery was an unspoken rebellion against Cruz's narrowing vision of control and order.

Then Taylor did something unexpected. They paused beside Jordan and, for a moment, observed the device with something akin to reverence. “If this tech can be understood..." Taylor said, their voice quieter, "It could change the game for us. For all of us.”

The underlying dismissal earlier seemed to falter, replaced by a glimpse of reluctant respect for the gravity of what lay in their hands. Jordan looked up, and for a fleeting heartbeat, their eyes locked with Taylor's, a wordless clash of wills softening into an uneasy truce.

It was a small transformation, barely perceptible, but one that Alex noted with an inward nod. They had all been brought here by different paths
################
Output:
("entity"{tuple_delimiter}"Alex"{tuple_delimiter}"person"{tuple_delimiter}"Alex is a character who experiences frustration and is observant of the dynamics among other characters."){record_delimiter}
("entity"{tuple_delimiter}"Taylor"{tuple_delimiter}"person"{tuple_delimiter}"Taylor is portrayed with authoritarian certainty and shows a moment of reverence towards a device, indicating a change in perspective."){record_delimiter}
("entity"{tuple_delimiter}"Jordan"{tuple_delimiter}"person"{tuple_delimiter}"Jordan shares a commitment to discovery and has a significant interaction with Taylor regarding a device."){record_delimiter}
("entity"{tuple_delimiter}"Cruz"{tuple_delimiter}"person"{tuple_delimiter}"Cruz is associated with a vision of control and order, influencing the dynamics among other characters."){record_delimiter}
("entity"{tuple_delimiter}"The Device"{tuple_delimiter}"technology"{tuple_delimiter}"The Device is central to the story, with potential game-changing implications, and is revered by Taylor."){record_delimiter}
("relationship"{tuple_delimiter}"Alex"{tuple_delimiter}"Taylor"{tuple_delimiter}"Alex is affected by Taylor's authoritarian certainty and observes changes in Taylor's attitude towards the device."{tuple_delimiter}7){record_delimiter}
("relationship"{tuple_delimiter}"Alex"{tuple_delimiter}"Jordan"{tuple_delimiter}"Alex and Jordan share a commitment to discovery, which contrasts with Cruz's vision."{tuple_delimiter}6){record_delimiter}
("relationship"{tuple_delimiter}"Taylor"{tuple_delimiter}"Jordan"{tuple_delimiter}"Taylor and Jordan interact directly regarding the device, leading to a moment of mutual respect and an uneasy truce."{tuple_delimiter}8){record_delimiter}
("relationship"{tuple_delimiter}"Jordan"{tuple_delimiter}"Cruz"{tuple_delimiter}"Jordan's commitment to discovery is in rebellion against Cruz's vision of control and order."{tuple_delimiter}5){record_delimiter}
("relationship"{tuple_delimiter}"Taylor"{tuple_delimiter}"The Device"{tuple_delimiter}"Taylor shows reverence towards the device, indicating its importance and potential impact."{tuple_delimiter}9){completion_delimiter}
#############################
Example 2:

Entity_types: [person, technology, mission, organization, location]
Text:
They were no longer mere operatives; they had become guardians of a threshold, keepers of a message from a realm beyond stars and stripes. This elevation in their mission could not be shackled by regulations and established protocols—it demanded a new perspective, a new resolve.

Tension threaded through the dialogue of beeps and static as communications with Washington buzzed in the background. The team stood, a portentous air enveloping them. It was clear that the decisions they made in the ensuing hours could redefine humanity's place in the cosmos or condemn them to ignorance and potential peril.

Their connection to the stars solidified, the group moved to address the crystallizing warning, shifting from passive recipients to active participants. Mercer's latter instincts gained precedence— the team's mandate had evolved, no longer solely to observe and report but to interact and prepare. A metamorphosis had begun, and Operation: Dulce hummed with the newfound frequency of their daring, a tone set not by the earthly
#############
Output:
("entity"{tuple_delimiter}"Washington"{tuple_delimiter}"location"{tuple_delimiter}"Washington is a location where communications are being received, indicating its importance in the decision-making process."){record_delimiter}
("entity"{tuple_delimiter}"Operation: Dulce"{tuple_delimiter}"mission"{tuple_delimiter}"Operation: Dulce is described as a mission that has evolved to interact and prepare, indicating a significant shift in objectives and activities."){record_delimiter}
("entity"{tuple_delimiter}"The team"{tuple_delimiter}"organization"{tuple_delimiter}"The team is portrayed as a group of individuals who have transitioned from passive observers to active participants in a mission, showing a dynamic change in their role."){record_delimiter}
("relationship"{tuple_delimiter}"The team"{tuple_delimiter}"Washington"{tuple_delimiter}"The team receives communications from Washington, which influences their decision-making process."{tuple_delimiter}7){record_delimiter}
("relationship"{tuple_delimiter}"The team"{tuple_delimiter}"Operation: Dulce"{tuple_delimiter}"The team is directly involved in Operation: Dulce, executing its evolved objectives and activities."{tuple_delimiter}9){completion_delimiter}
#############################
Example 3:

Entity_types: [person, role, technology, organization, event, location, concept]
Text:
their voice slicing through the buzz of activity. "Control may be an illusion when facing an intelligence that literally writes its own rules," they stated stoically, casting a watchful eye over the flurry of data.

"It's like it's learning to communicate," offered Sam Rivera from a nearby interface, their youthful energy boding a mix of awe and anxiety. "This gives talking to strangers' a whole new meaning."

Alex surveyed his team—each face a study in concentration, determination, and not a small measure of trepidation. "This might well be our first contact," he acknowledged, "And we need to be ready for whatever answers back."

Together, they stood on the edge of the unknown, forging humanity's response to a message from the heavens. The ensuing silence was palpable—a collective introspection about their role in this grand cosmic play, one that could rewrite human history.

The encrypted dialogue continued to unfold, its intricate patterns showing an almost uncanny anticipation
#############
Output:
("entity"{tuple_delimiter}"Sam Rivera"{tuple_delimiter}"person"{tuple_delimiter}"Sam Rivera is a member of a team working on communicating with an unknown intelligence, showing a mix of awe and anxiety."){record_delimiter}
("entity"{tuple_delimiter}"Alex"{tuple_delimiter}"person"{tuple_delimiter}"Alex is the leader of a team attempting first contact with an unknown intelligence, acknowledging the significance of their task."){record_delimiter}
("entity"{tuple_delimiter}"Control"{tuple_delimiter}"concept"{tuple_delimiter}"Control refers to the ability to manage or govern, which is challenged by an intelligence that writes its own rules."){record_delimiter}
("entity"{tuple_delimiter}"Intelligence"{tuple_delimiter}"concept"{tuple_delimiter}"Intelligence here refers to an unknown entity capable of writing its own rules and learning to communicate."){record_delimiter}
("entity"{tuple_delimiter}"First Contact"{tuple_delimiter}"event"{tuple_delimiter}"First Contact is the potential initial communication between humanity and an unknown intelligence."){record_delimiter}
("entity"{tuple_delimiter}"Humanity's Response"{tuple_delimiter}"event"{tuple_delimiter}"Humanity's Response is the collective action taken by Alex's team in response to a message from an unknown intelligence."){record_delimiter}
("relationship"{tuple_delimiter}"Sam Rivera"{tuple_delimiter}"Intelligence"{tuple_delimiter}"Sam Rivera is directly involved in the process of learning to communicate with the unknown intelligence."{tuple_delimiter}9){record_delimiter}
("relationship"{tuple_delimiter}"Alex"{tuple_delimiter}"First Contact"{tuple_delimiter}"Alex leads the team that might be making the First Contact with the unknown intelligence."{tuple_delimiter}10){record_delimiter}
("relationship"{tuple_delimiter}"Alex"{tuple_delimiter}"Humanity's Response"{tuple_delimiter}"Alex and his team are the key figures in Humanity's Response to the unknown intelligence."{tuple_delimiter}8){record_delimiter}
("relationship"{tuple_delimiter}"Control"{tuple_delimiter}"Intelligence"{tuple_delimiter}"The concept of Control is challenged by the Intelligence that writes its own rules."{tuple_delimiter}7){completion_delimiter}
#############################
-Real Data-
######################
Entity_types: {entity_types}
Text: {input_text}
######################
Output:

```

还有一个补充过程，就是会继续追问大模型，有没有遗漏的实体和关系。

```python
CONTINUE_PROMPT = "MANY entities were missed in the last extraction.  Add them below using the same format:\n"
LOOP_PROMPT = "It appears some entities may have still been missed. Answer Y if there are still entities that need to be added, or N if there are none. Please answer with a single letter Y or N.\n"
```

对每一个 chunk 做完 \_process_single_content 之后，所有的结果存储到 out_results 里面。

然后是一个工程上的处理吧，大概如下：

1. 遍历 out_results，将数据放到 maybe_nodes maybe_edges 中。
2. 然后对 maybe_nodes maybe_edges 做 merge，得到 all_entities_data all_relationships_data，并返回
3. 遍历 all_entities_data all_relationships_data ，调用 add_edge 和 add_node ，创建一个 subgraph 并返回。也就是前面提到的两大步骤里面的 generate_subgraph。


# 数据结构

## 解析过程中的数据结构

使用了 [https://networkx.org/](https://networkx.org/) 这个库来创建和操作图。上面提到的 subgraph 就是一个 NetworkX 的 Graph 对象。

## 存储(ES)中的数据结构

解析之后，得到三种数据，entity（节点，多个）, relation（边，多个）, graph（一个）。

### entity

`knowledge_graph_kwd: "entity"` 代表这是一个entity(节点)

entity_type_kwd 是节点的类型，具体可以有哪些类型，是用户在 ragflow 界面上配置的。

description 是大模型根据文档(也根据自己的知识)生成的描述。**这个在后面的搜索中会返回，当成知识库内容的一部分，交给大模型用来总结回答问题。**

```json
{
  "knowledge_graph_kwd": "entity",
  "entity_kwd": "JBOD",
  "entity_type_kwd": "CATEGORY",
  "content_with_weight": "{\"entity_type\": \"CATEGORY\", \"description\": \"JBOD refers to a storage configuration where multiple hard drives are connected without RAID, allowing for independent operation.\", \"source_id\": [\"ab6bae962a3c11f09c470242ac1b0002\"], \"entity_name\": \"JBOD\", \"pagerank\": 0.037568948943104266}",
}
```

### relation

```json
{
  "knowledge_graph_kwd": "relation",
  "from_entity_kwd": "JBOD",
  "to_entity_kwd": "硬盘",
  "content_with_weight": "{\"src_id\": \"JBOD\", \"tgt_id\": \"硬盘\", \"description\": \"JBOD配置允许硬盘独立工作，适用于不需要RAID的环境。\", \"keywords\": [\"存储配置, 硬件管理\"], \"weight\": 7.0, \"source_id\": [\"ab6bae962a3c11f09c470242ac1b0002\"]}",
}
```

### graph

gragh 是一个总的图，包含了所有的节点和边。貌似在搜索中用不到，只是用来在前端展示。

# 知识图谱的搜索

在ragflow 中的实现，和我之前自己想像的不太一样。

我的理解是，先从向量库中找到相关的文档，然后再从知识图谱中找到相关的边和节点，再根据这些节点，捞取对应的文档。将所有这些文档拼接在一起，交给大模型来回答问题。

ragflow 的实现是，先从向量库中找到相关的文档，接下来就是直接从用户的问题去搜索知识图谱，然后根据特定的算法对节点和边打分，将 TopN 的结果返回给大模型。主要是用到其中的 description。

但它也在代码中，留下了一些接口，后面也许能将知识图谱中边和节点对应的文档捞取出来：

1. kb_prompt 会根据节点和边的 doc_id 属性，去向量库中捞取对应的文档。但目前，边和节点的 doc_id 还是空字符串。
2. 目前只是将文档的 meta 信息补充进来。
3. 如果真的要捞取文档，也不能根据 doc_id 捞数据，而是应该 chunk_id。

```python

ragflow 的界面中，有三个地方可以搜索。

1. 知识库的“检索验证”页面，这里可以勾选“知识图谱”。
2. 顶部的“搜索”页面，这里可以多知识库一起搜索，但没有知识图谱的选项。
3. 创造一个聊天机器人，这里可以选择知识库和是否使用知识图谱。

我们用第三种搜索来看它的具体实现。

核心代码

```python
# 根据关键词和向量 检索知识库（不包括知识图谱）
kbinfos = retriever.retrieval(
    " ".join(questions),
    embd_mdl,
    tenant_ids,
    dialog.kb_ids,
    1,
    dialog.top_n,
    dialog.similarity_threshold,
    dialog.vector_similarity_weight,
    doc_ids=attachments,
    top=dialog.top_k,
    aggs=False,
    rerank_mdl=rerank_mdl,
    rank_feature=label_question(" ".join(questions), kbs),
)

# 这里是知识图谱的检索，下面具体分析
ck = settings.kg_retrievaler.retrieval(
    " ".join(questions),
    tenant_ids,
    dialog.kb_ids,
    embd_mdl,
    LLMBundle(dialog.tenant_id, LLMType.CHAT),
)

kbinfos["chunks"].insert(0, ck)

## 补充数据，目前是补充 doc 的 meta 信息
knowledges = kb_prompt(kbinfos, max_tokens)

# 根据 kownledges 让大模型回答问题，并对结果进行一定的格式化处理，在 HTML 上呈现更好的效果。
# ...
```

知识图谱检索的核心代码 settings.kg_retrievaler.retrieval ：

```python
# 使用大模型提取 keyword_type(目前版本始终为空) 和 entities
ty_kwds, ents = self.query_rewrite(llm, qst, [index_name(tid) for tid in tenant_ids], kb_ids)

# 知识图谱的检索

## 对 entities(节点) 进行向量搜索
ents_from_query = self.get_relevant_ents_by_keywords(ents, filters, idxnms, kb_ids, emb_mdl, ent_sim_threshold)
## 对 keyword_type 分词搜索(非向量搜索)
ents_from_types = self.get_relevant_ents_by_types(ty_kwds, filters, idxnms, kb_ids, 10000)
## 对 relation(边) 进行向量搜索
rels_from_txt = self.get_relevant_relations_by_txt(qst, filters, idxnms, kb_ids, emb_mdl, rel_sim_threshold)

# 对边和节点打分

# 将所有的节点和边的数据，简单按csv格式拼接并返回
```

# 社区报告

还未了解，后面补充。
