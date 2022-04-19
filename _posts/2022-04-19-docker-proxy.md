---

date: 2022-04-19T10:53:27+0800
layout: post

---

Proxy effect in dockerd(docker daemon) is different from that in docker cli.

Proxy setting in dockerd acts when dealing with registry, such as `docker pull push login`.

Command in dockerfile when doing `docker build` and `docker run` use proxy setting in docker cli (NOT automatically in environment way, see details below).

<!--more-->

## Configure proxy in docker daemon

The Docker daemon uses the `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environmental variables in its start-up environment to configure HTTP or HTTPS proxy behavior. You cannot configure these environment variables using the `daemon.json` file.

1. Create a systemd drop-in directory for the docker service:

    ```sh
     sudo mkdir -p /etc/systemd/system/docker.service.d
     ```

2. Create a file named `/etc/systemd/system/docker.service.d/http-proxy.conf` that adds the `HTTP_PROXY` environment variable:

    ```
    [Service]
    Environment="HTTP_PROXY=http://proxy.example.com:80"
    ```

    If you are behind an HTTPS proxy server, set the HTTPS_PROXY environment variable:

    ```
    [Service]
    Environment="HTTPS_PROXY=https://proxy.example.com:443"
    ```

    Multiple environment variables can be set; to set both a non-HTTPS and a HTTPs proxy;

    ```
    [Service]
    Environment="HTTP_PROXY=http://proxy.example.com:80"
    Environment="HTTPS_PROXY=https://proxy.example.com:443"
    ```

3. If you have internal Docker registries that you need to contact without proxying you can specify them via the NO_PROXY environment variable.

    The NO_PROXY variable specifies a string that contains comma-separated values for hosts that should be excluded from proxying. These are the options you can specify to exclude hosts:

    - IP address prefix (1.2.3.4)
    - Domain name, or a special DNS label (*)
    - A domain name matches that name and all subdomains. A domain name with a leading “.” matches subdomains only. For example, given the domains foo.example.com and example.com:
      - example.com matches example.com and foo.example.com, 
      - and .example.com matches only foo.example.com
    - A single asterisk (*) indicates that no proxying should be done
    - Literal port numbers are accepted by IP address prefixes (1.2.3.4:80) and domain names (foo.example.com:80)


## Configure proxy in docker cli

If your container needs to use an HTTP, HTTPS, or FTP proxy server, you can configure it in different ways:

- In Docker 17.07 and higher, you can configure the Docker client to pass proxy information to containers automatically.

- In Docker 17.06 and earlier versions, you must set the appropriate environment variables within the container. You can do this when you build the image (***which makes the image less portable***) or when you create or run the container.

### Configure the Docker client

1. On the Docker client, create or edit the file ~/.docker/config.json in the home directory of the user that starts containers. Add JSON similar to the following example. Substitute the type of proxy with httpsProxy or ftpProxy if necessary, and substitute the address and port of the proxy server. You can also configure multiple proxy servers simultaneously.

    You can optionally exclude hosts or ranges from going through the proxy server by setting a noProxy key to one or more comma-separated IP addresses or hosts. Using the * character as a wildcard for hosts and using CIDR notation for IP addresses is supported as shown in this example:

    ```json
    {
     "proxies":
     {
       "default":
       {
         "httpProxy": "http://192.168.1.12:3128",
         "httpsProxy": "http://192.168.1.12:3128",
         "noProxy": "*.test.example.com,.example2.com,127.0.0.0/8"
       }
     }
    }
    ```

2. ***When you create or start new containers, the environment variables are set automatically within the container.***

### Use environment variables

***When you build the image, or using the --env flag when you create or run the container, you can set one or more of the following variables to the appropriate value. This method makes the image less portable, so if you have Docker 17.07 or higher, you should configure the Docker client instead.***

| Variable      | Dockerfile example | `docker run` example |
| ----------- | ----------- |----------- |
| HTTP_PROXY      | ENV HTTP_PROXY="http://192.168.1.12:3128"       | --env HTTP_PROXY="http://192.168.1.12:3128" |
| HTTPS_PROXY   | ENV HTTPS_PROXY="https://192.168.1.12:3128"        | --env HTTPS_PROXY="https://192.168.1.12:3128" |
| FTP_PROXY   | ENV FTP_PROXY="ftp://192.168.1.12:3128"        | --env FTP_PROXY="ftp://192.168.1.12:3128" |
| NO_PROXY   | ENV NO_PROXY="*.test.example.com,.example2.com"        | --env NO_PROXY="*.test.example.com,.example2.com" |


## references

-  [https://docs.docker.com/config/daemon/systemd/](https://docs.docker.com/config/daemon/systemd/)
- [https://docs.docker.com/network/proxy/](https://docs.docker.com/network/proxy/)
