---

date: 2020-08-17T15:58:11+0800
title: '[译] Why Should We Separate A and AAAA DNS Queries'
layout: post

---

看了朋友一篇文章[https://leeweir.github.io/posts/wget-curl-does-not-resolve-domain-properly/](https://leeweir.github.io/posts/wget-curl-does-not-resolve-domain-properly/), 直接拉到最后的根因, 看到里面写:

> curl 不指定协议访问的时候，为什么直接从(DNS)缓存里返回了结果而不做dns解析，还是要具体从libcurl的实现上去分析

我的第一反应是不太可能, curl 的请求不会因为指定使用 ipv4 就做 DNS 解析,  ipv6 不做. libcurl 不可能这么实现.

然后去翻了 libcurl 的代码, 他是使用[另外一个叫 ARES 的库](https://github.com/c-ares/c-ares)去做的 DNS 解析. 在 ARES 中看到有解析 ipv6 的时候, 使用了多线程(细节有些记不清了). 然后搜索文章, 就看到了下面这篇文章: 为什么我们要分开请求 A 和 AAAA DNS记录?

<!--more-->

**[原文地址]** [Why Should We Separate A and AAAA DNS Queries?](https://blogs.infoblox.com/ipv6-coe/why-should-we-separate-a-and-aaaa-dns-queries/)

Imagine what it was like to be an ancient mariner navigating the ocean blue at night using nothing more than stars, a sextant and a marine chronometer.  Thankfully, navigating the Internet is not as daunting.  The method that networked devices use to find their way around the digital ocean is the Domain Name System (DNS), which translates human-readable host and domain names into numerical IP addresses (and vice versa).

想像一下古代的水手在夜晚的海洋航行, 除了星星,六分仪和天文钟之外, 没有其他东西可以指引方向. 还好, 在因特网上冲浪没有这么可怕. 网络设备使用域名系统(DNS) 在数字海洋里面找路, DNS 可以把人类可读的域名转成数字的 IP (或者反过来)

Separate DNS Queries

分开的 DNS 请求

One aspect of dual-protocol behavior that often surprises peoples is that hosts send two separate DNS queries to their resolver.  And today, frankly, all hosts are dual-protocol bilingual and can use either IP version (4 or 6) for their DNS traffic or for the DNS queries and responses contained within.  The reason that there are separate IPv4 A record and IPv6 AAAA record DNS queries is that early IPv6 deployments occasionally encountered problems with older IPv4-only resolvers.

让很多惊讶的一点是: 解析双协议(ipv4 ipv6)的时候, 会发送两个独立的 DNS 请求到解析服务器. 坦率的讲, 现在如今所有主机都可以支持双协议, 可以使用ipv4或者ipv6来传输数字, 或者响应 DSN 请求. 那为什么要分开请求呢? 因为一些早期的解析器只支持 IPV4, 这会导致一些问题.


If a host sent an ANY query or an IPv6 AAAA DNS query to a resolver which was not IPv6-literate, the resolver would return an erroneous response code (RCODE) such as NXDOMAIN.  The would lead the host to believe that the domain did not exist, when in fact there was a perfectly valid IPv4 A record that, if returned, would have resulted in the host at least making a connection over IPv4.

如果一个主机发送一个 ANY 类型的请求, 或者是 AAAA IPv6 类型的请求. 解析服务器恰巧不能正确处理 IPV6, 它可能会返回一个错误码, 比如说 NXDOMAIN. 这可能会导致主机认为这个域名不存在, 但实际上域名可能有一个合法的 IPV4地址. 如果我们能拿到这个 IPV4 地址, 我们还可以使用 IPV4 连接.

Because these older DNS resolvers could not handle a AAAA query or response correctly, the IETF issued RFC 4074 “[Common Misbehavior Against DNS Queries for IPv6 Addresses](https://tools.ietf.org/html/rfc4074)”.  Now, hosts issue separate AAAA and A queries and if the AAAA query fails, it is likely that the A query will succeed and the host can connect.

因为这些早期的 DNS 解析器不能正确处理 AAAA 请求, IETE 还在 RFC 4074 中专门讨论了这个问题, 在这个 Issue 中讨论了一些已知的现象及其影响.  现在, 分开发送 AAAA 和 A 请求, 如果 AAAA 失败了, 很可能 A 请求还能正确返回, 我们也可以继续建连.

For example, here is a Wireshark packet capture showing that a simple DNS query for www.rmv6tf.org resulted four packets on the network.  The DNS query started with an A record query (packet 74) followed by an A record response (packet 75).  Then an AAAA record query (packet 76) was sent and an AAAA record response (packet 79) was returned.  The AAAA query is expanded in the frame packet decode window.

来看个例子, 下面是 Wireshark 抓包, 显示了一个到 www.rmv6tf.org 的 DNS 请求和返回, 一共4个包. 先是发起了一个 A 记录请求, 接着一个 A 记录的返回. 然后是 AAAA 记录的请求和返回.

[!Wireshark Packet Capture](https://blogs.infoblox.com/wp-content/uploads/wireshark-packet-capture.jpg)

*[译者注]* 后面已经和主题没有关系了, 是其他的一些东西, 奇怪的知识又增加了..

In 2011, when [World IPv6 Day](https://en.wikipedia.org/wiki/World_IPv6_Day_and_World_IPv6_Launch_Day) was approaching, there was significant work performed to improve how hosts operated in dual-protocol environments and recovered from failures of either IP version.  The IETF issued RFC 6555 “Happy Eyeballs”, which outlined a more aggressive algorithm that would provide connection resiliency and make the Internet users/customers/eyeballs happier with their connectivity.  This happy eyeballs technique can be implemented in a  web browser like Chrome, or the algorithm can be implemented in the host OS like with Microsoft Network Connectivity Status Indicator (NCSI) or in Apple iOS or OS X.  Regardless, the outcome is that hosts can operate effectively in dual-protocol environments and can recover and establish IP connections using the version that provides the best end-user experience.

2011 年, [世界 IPV6日](https://en.wikipedia.org/wiki/World_IPv6_Day_and_World_IPv6_Launch_Day)临近之际, 为了改善主机在双协议环境中的运行方式以及从任一IP版本的故障中恢复的能力，进行了大量工作. IETF 提了 RFC 6555 "[Happy Eyeballs]”(https://tools.ietf.org/html/rfc6555), 这个提议提出了一个激进算法, 可以提供链接快速恢复能力, 让我们的互联网使用者/客户/EyeBalls 更 Happy. 这个技术可以在浏览器比如说 Chrome 中使用, 也可以在操作系统, 比如 Windows 或者 IOS 或 OS X中使用. 不管哪种, 结果就是可以在双协议环境下恢复以及使用正确的协议建连, 以给用户提供更好的体验.

*[译者注]* Eyeball 指终端, 也就是代表互联网上的人类用户, 与此对应的是服务器端. 简单说下这个算法, 就是同时发起 IPV4 和 IPV6 的建连请求, 如果一个没返回, 就只使用另外一个; 如果都返回了, 就使用 IPV6, 把 IPV4 Reset掉. 同时要缓存这个结果, 以便后续直接使用. 建议缓存大概10分钟.

Dangers of ANY Queries

There are other issues with DNS queries for Query Class (QCLASS) ANY besides causing problems for very old DNS resolvers that don’t understand IPv6 AAAA records.  A DNS ANY query can result in a lot of data returned from the authoritative name server.  The DNS server that receives an ANY query will simply respond with all the information it has on the subject including A records, AAAA records, DNSSEC key material, etc.  If a DNS server is acting as an Open DNS Resolver and not restricting who can query it, then it may be participating as an unknowing contributor to a DDoS attack.  These same types of DDoS attacks can take place, [on only with DNS, but with NTP, and may leverage insecure IoT devices](https://community.infoblox.com/t5/Security-Blog/DDoS-IoT-and-IPv6-Addressing-the-Threat/ba-p/8336).

ANY 类型请求的危险

除了一些老的解析服务器不能正确处理 AAAA 记录外, 请求 ANY 类型还有其他问题, 这样的请求可能会从权威域名服务器返回大量的数据. 域名服务器会把所有这些信息返回给请求者, 包括 A 记录, AAAA 记录, DNSSEC 等. 如果一个域名服务器提供公开服务, 不限制请求者, 那它可能会在不知情的情况下推演 DDoS 攻击的参与者. [同样类型的 DDos 攻击也可能发生成 NTP 服务中, 起到一个杠杠的作用](https://community.infoblox.com/t5/Security-Blog/DDoS-IoT-and-IPv6-Addressing-the-Threat/ba-p/8336).

*[译者注]* DDoS的原理是, 往权威服务器写一个巨大的数据, 然后伪装受害者的地址发起 DNS 请求, 这会导致大量的数据涌向受害者.

Today, the legitimate uses of an ANY query are almost non-existent, but the nefarious uses of ANY are numerous.  Now there are organizations that want to stop answering ANY queries altogether.  Among these organizations is CloudFlare, one of the largest IPv6-enabled Content Delivery Networks (CDNs).  CDNs are another way that we can circumnavigate the Internet seas.  CloudFlare stopped answering ANY DNS queries over one year ago.  If you send a query for ANY to CloudFlare you will receive back a NotImp (Not Implemented) RCODE.  CloudFlare’s team has also worked on two IETF DNSOP working group drafts on this topic, “DNS Meta-Queries restricted” and “Providing Minimal-Sized Responses to DNS Queries that have QTYPE=ANY”.

如今，几乎不存在对 ANY 查询的合法使用，但对 ANY 的恶意使用却很多。 现在，有些组织希望完全停止回答 ANY 查询。 在这些组织中，CloudFlare是最大的启用 IPv6 的内容交付网络（CDN）之一。 CDN是我们可以遨游互联网海洋的另一个途径。 一年多以前，CloudFlare 停止回答ANY DNS 查询。 如果您向CloudFlare发送ANY查询，您将收到NotImp（未实现）RCODE。 CloudFlare的团队还就此主题制定了两个IETF DNSOP工作组草案，即“ DNS元数据查询受限制”和“对ANY DNS查询提供最小化的响应”。

Future DNS Improvements
The Internet, DNS servers, host operating systems, service providers and content providers have significantly progressed since RFC 4074 was written to address old IPv4-only resolvers.  Now, few of us worry about misbehaving resolvers, other than the concern that they might be too permissive in allowing DNS DDoS packet amplification.  At this middle-stage of IPv6 adoption, should the DNS behavior be changed again?  Or would making a mid-voyage course correction lead us toward an Internet Bermuda Triangle?

自从 RFC4074 被用来解决早期服务器的只能解析 IPv4 问题以来，互联网、DNS 服务器、主机操作系统、服务提供商和内容提供商都有了长足的进步。现在，我们很少有人担心错误的解析器，除了担心他们在允许 DNS-DDoS 数据包放大方面可能过于宽容，在 IPv6 应用的中间阶段，DNS 的行为是否应该再次改变？或者，中途修正航向会使我们走向互联网百慕大三角？

During the recent 2017 North American IPv6 Summit, Dani Grant from CloudFlare (@thedanigrant), gave a presentation about their IPv6 deployment experiences.  She mentioned the non-response to DNS ANY queries described above and mentioned how we may want to optimize DNS queries for IPv6.

在最近的 2017 年北美 IPv6 峰会上，来自 CloudFlare（@thedanigrant）的 Dani Grant 介绍了他们的 IPv6 部署体验。她提到了上文说的 ANY DNS 查询没有响应的情况，并提到我们可能希望如何优化 IPv6 的 DNS 查询。

Marek Vavrusa (@vavrusam) and Olafur Gudmundsson (@OGudm) from CloudFlare have put forward an IETF draft titled “Providing AAAA records for free with QTYPE=A”.  This proposal eliminates the separate A and AAAA query we use today, and return an AAAA record response along with the A record response.  This would cut the number of queries and responses in half.

CloudFlare 的 Marek Vavrusa（@vavrusam）和 Olafur Gudmundsson（@OGudm）提出了一个 IETF 草案，标题是 “对 A 查询提供额外的 AAAA 记录”。这项提议取消了我们今天使用的单独的 A 和 AAAA 查询，并返回一个 AAAA 记录响应和一个A 记录响应，这样可以将查询和响应的数量减少一半。

Providing both an A record response and AAAA record response could be thought of as a theoretical “AAAAA response”.  Jokingly, the term “Quint-A” was coined by Cody Christman (of Wipro and the RMv6TF), while at the 2017 North American IPv6 Summit.

提供 A 记录响应和 AAAA 记录响应可以被视为理论上的 “AAAAA 响应”。开玩笑地说，“Quint-A” 一词是由 Cody Christman（Wipro 和 RMv6TF 的）在 2017 年北美 IPv6 峰会上提出的。

Research and work continues in this area to explore how DNS meta-CLASSes can be used to carry additional information such as AAAA records responses.  These potential directions may include adding an ADDR meta-query.  This would require changes to servers and hosts and would take years to gain wide-scale adoption.  The intent here is that these changes could  result in continuing to drive higher IPv6 adoption rates and reduce the DNS traffic on networks.

在这一领域的研究和工作仍在继续，以探索如何使用 DNS 元类来承载附加信息，如 AAAA 记录响应。潜在的方向可能包括添加一个 ADDR 元查询。这将需要对服务器和主机进行更改，并需要数年时间才能获得广泛采用。目的是这些变化可以使 IPv6 采用率继续提高，并减少网络上的 DNS 流量。

Summary
Just like IPv4, IPv6 will never stop evolving as a network protocol.  Even though we have standards for global Internet behavior, we are constantly seeking out ways to improve IP networking.  Even though IPv6 is now firmly deployed on the Internet and its adoption continues to grow, there is still time to optimize IPv6 behavior.  What might have worked well when we were embarking on the IPv6 voyage may not be the way we want our systems to behave when we move to a predominantly IPv6-only Internet.  Even though IPv6 is a “work in progress”, there is no reason to let this slow down your IPv6 deployment plans.  Full steam ahead! But we will use our rudder to make some subtle course corrections as we cruise onward.

就像 IPv4 一样，IPv6 作为一种网络协议永远不会停止发展，尽管我们有了全球互联网行为的标准，但我们仍在不断寻找改善 IP 网络的方法。尽管 IPv6 现在已经牢固地部署在互联网上，而且其采用率也在不断增长，我们仍有时间优化 IPv6 的行为。当我们开始 IPv6 之旅时，可能效果良好的可能并不是我们希望我们的系统在移动到仅 IPv6 为主的 Internet 时的行为方式。尽管 IPv6 是一个 “正在进行的工作”，没有理由让这件事拖慢你的 IPv6 部署计划。全力以赴吧！但当我们继续航行时，我们会用我们的舵进行一些细微的航向修正。
