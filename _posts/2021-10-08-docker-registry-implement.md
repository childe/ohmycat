---

date: 2021-10-08T11:35:00+0800

---

对照[https://docs.docker.com/registry/spec/api/](https://docs.docker.com/registry/spec/api/)，使用 Flask 做一下实现。但发现有两处和文档不太符合的地方。

## 1. Chunked Upload

文档中说，需要返回格式如下：

```
202 Accepted
Location: /v2/<name>/blobs/uploads/<uuid>
Range: bytes=0-<offset>
Content-Length: 0
Docker-Upload-UUID: <uuid>
```

这里显示 Range 的格式与[Range - HTTP \| MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range) 中说的一致。

但实际上，前面不能加 `bytes=`。否则 docker cli 会报错。

上面的文档是说 Request 里面的 Range，但 Docker 文档这里用到的其实是 Response，不知道是不是这个区别，感觉前面加单位是合理的。

## 2. Completed Upload

传输完成一个 Layer之后，需要 Put 确认完成。 Server 应该返回如下信息。
```
201 Created
Location: /v2/<name>/blobs/<digest>
Content-Length: 0
Docker-Content-Digest: <digest>
```

文档中说 `The Location header will contain the registry URL to access the accepted layer file`。 

但实际上，docker cli 不会通过这个返回的 Location 来确认 Layer。而是通过 `HEAD /v2/liujia/test/blobs/sha256:c74f8866df097496217c9f15efe8f8d3db05d19d678a02d01cc7eaed520bb136 HTTP/1.1` 来确认的。就是说，不管Location 返回什么，都是通过之前的 digest 来做 HEAD 请求确认 Layer 信息的。

## 3. Get Manifest

返回的时候，需要解析 manifest 文件里面的 mediaType 作为 content-type 返回。


模拟实现 registry 的 python+flask 代码如下。

```py
# -*- coding: utf-8 -*-

from flask import Flask
from flask import request
from flask import make_response

from uuid import uuid1
import os
import json
from hashlib import sha256


app = Flask(__name__)
logger = app.logger

registry_data_root = "./data/"


@app.route("/v2/")
def v2():
    return ""


@app.route("/v2/<path:reponame>/manifests/<string:reference>", methods=["HEAD", "GET"])
def get_manifest(reponame, reference):
    path = os.path.join(
        registry_data_root, "manifests", reponame, *reference.split(":")
    )
    resp = make_response()
    if not os.path.exists(path):
        resp.status = 404
        return resp

    resp.status = 200
    if request.method == "GET":
        data = open(path, "rb").read()
        resp.set_data(data)
        sha256_rst = sha256(data).hexdigest()
        resp.headers["Docker-Content-Digest"] = f"sha256:{sha256_rst}"
        resp.headers["Content-Length"] = str(len(data))
        content_type = json.loads(data)["mediaType"]
        resp.headers["Content-Type"] = content_type
    logger.info(resp.headers)
    return resp


@app.route("/v2/<path:reponame>/blobs/<string:digest>", methods=["HEAD", "GET"])
def get_layer(reponame, digest):
    logger.info(request.headers)

    path = os.path.join(registry_data_root, "blobs", reponame)
    dst = os.path.join(path, digest)
    resp = make_response()
    if not os.path.exists(dst):
        resp.status = 404
        return resp

    resp.status = 200
    if request.method == "GET":
        data = open(dst, "rb").read()
        resp.set_data(data)
        sha256_rst = sha256(data).hexdigest()
        resp.headers["Docker-Content-Digest"] = f"sha256:{sha256_rst}"
        resp.headers["Content-Length"] = str(len(data))

    logger.info(resp.headers)
    return resp


@app.route("/v2/<path:reponame>/blobs/uploads/", methods=["POST"])
def upload(reponame):
    logger.info(reponame)
    logger.info(request.headers)
    uuid = str(uuid1())
    resp = make_response()
    resp.headers["Location"] = f"/v2/{reponame}/blobs/uploads/{uuid}"
    resp.headers["Range"] = "bytes=0-0"
    resp.headers["Content-Length"] = "0"
    resp.headers["Docker-Upload-UUID"] = uuid
    resp.status = 202
    return resp


@app.route(
    "/v2/<path:reponame>/blobs/uploads/<string:uuid>",
    methods=["PATCH"],
)
def patch_upload(reponame, uuid):
    """
    Chunked Upload
    """
    logger.info(request.url)
    logger.info(reponame)
    logger.info(uuid)
    logger.info(request.headers)

    r = [e for e in request.headers if e[0].upper() == "RANGE"]
    if r:
        start = int(r[0].split("-")[0])
    else:
        start = 0

    path = os.path.join(registry_data_root, "_upload", reponame)
    os.makedirs(path, exist_ok=True)
    f = open(os.path.join(path, uuid), "ab")
    f.seek(start, os.SEEK_SET)
    data = request.stream.read()
    f.write(data)

    resp = make_response()
    resp.headers["Location"] = f"/v2/{reponame}/blobs/uploads/{uuid}"
    resp.headers["Range"] = f"0-{len(data)}"
    resp.headers["Content-Length"] = "0"
    resp.headers["Docker-Upload-UUID"] = uuid
    logger.info(f"{resp.headers=}")
    resp.status = 202
    return resp


@app.route(
    "/v2/<path:reponame>/blobs/uploads/<string:uuid>",
    methods=["PUT"],
)
def put_upload(reponame, uuid):
    """
    Completed Upload
    """
    logger.info(request.url)
    logger.info(reponame)
    logger.info(uuid)
    logger.info(request.headers)
    digest = request.args["digest"]

    dst_path = os.path.join(registry_data_root, "blobs", reponame)
    os.makedirs(dst_path, exist_ok=True)
    dst = os.path.join(dst_path, digest)
    src = os.path.join(registry_data_root, "_upload", reponame, uuid)
    logger.info(f"{src=} {dst=}")
    os.rename(src, dst)

    resp = make_response()
    resp.headers["Location"] = f"/v2/{reponame}/blobs/{digest}"
    logger.info(resp.headers)
    resp.status = 201
    return resp


@app.route(
    "/v2/<path:reponame>/manifests/<string:reference>",
    methods=["PUT"],
)
def put_manifest(reponame, reference):
    """
    Completed Upload
    """
    logger.info(request.url)
    logger.info(reponame)
    logger.info(request.headers)

    path = os.path.join(registry_data_root, "manifests", reponame)
    os.makedirs(path, exist_ok=True)
    data = request.stream.read()
    with open(os.path.join(path, reference), "wb") as f:
        f.write(data)

    sha256_rst = sha256(data).hexdigest()
    path = os.path.join(path, "sha256")
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, sha256_rst), "wb") as f:
        f.write(data)

    resp = make_response()
    resp.headers["Docker-Content-Digest"] = f"sha256:{sha256_rst}"
    resp.headers["Location"] = f"/v2/{reponame}/manifests/{reference}"
    logger.info(resp.headers)
    resp.status = 201
    return resp
```
