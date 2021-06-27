---

date: 2020-10-30T14:40:51+0800
title: 'systemd for Developers I'
layout: post

---

原文[systemd for Developers I](http://0pointer.de/blog/projects/socket-activation.html)


systemd not only brings improvements for administrators and users, it also brings a (small) number of new APIs with it. In this blog story (which might become the first of a series) I hope to shed some light on one of the most important new APIs in systemd: Socket Activation

systemd 不仅为管理员和用户带来了改进，还带来了少量的新 api。在这个博客故事中（可能成为本系列文章的第一篇），我希望能对 systemd 中最重要的一个新 api 做一个分享：Socket Activation

In the original blog story about systemd I tried to explain why socket activation is a wonderful technology to spawn services. Let's reiterate the background here a bit.

在关于 systemd 的最开始的博客故事中，我试图解释为什么 socket activation 是一种神奇的服务创建技术。让我们在这里再介绍一下背景。

<!--more-->

The basic idea of socket activation is not new. The inetd superserver was a standard component of most Linux and Unix systems since time began: instead of spawning all local Internet services already at boot, the superserver would listen on behalf of the services and whenever a connection would come in an instance of the respective service would be spawned. This allowed relatively weak machines with few resources to offer a big variety of services at the same time. However it quickly got a reputation for being somewhat slow: since daemons would be spawned for each incoming connection a lot of time was spent on forking and initialization of the services -- once for each connection, instead of once for them all.

Socket Activation 的基本思想并不是新的。inetd 从一开始就是大多数 Linux 和 Unix 系统的一个标准组件：它不在系统启动时生成所有本地 Internet 服务，而是代表服务进行监听，每当连接到来时，都会生成相应服务的实例。这使得资源较少的相对较弱的机器能够同时提供各种各样的服务。然而，它很快就以速度慢而闻名：因为每个传入的连接都会产生守护进程，所以在服务创建和初始化上花费了大量时间 —— 每个新的连接都会创建和初始化一次，而不是所有连接只创建一次。

Spawning one instance per connection was how inetd was primarily used, even though inetd actually understood another mode: on the first incoming connection it would notice this via poll() (or select()) and spawn a single instance for all future connections. (This was controllable with the wait/nowait options.) That way the first connection would be slow to set up, but subsequent ones would be as fast as with a standalone service. In this mode inetd would work in a true on-demand mode: a service would be made available lazily when it was required.

每个连接生成一个实例是 inetd 的主要使用方式，尽管 inetd 实际上也知道另一种模式：在第一个连接传入时，它会通过 poll（）（或 select（））感知到，并为将来的所有连接生成一个实例。（可以通过 wait/nowait 选项来控制。）这样一来，第一个连接的建立速度会很慢，但随后的连接将与独立服务一样快。在这种模式下，inetd 将在真正的在按需模式下工作：当服务被需要的时候，它才被创建，延迟的创建。

inetd's focus was clearly on AF_INET (i.e. Internet) sockets. As time progressed and Linux/Unix left the server niche and became increasingly relevant on desktops, mobile and embedded environments inetd was somehow lost in the troubles of time. Its reputation for being slow, and the fact that Linux' focus shifted away from only Internet servers made a Linux machine running inetd (or one of its newer implementations, like xinetd) the exception, not the rule.

inetd 的关注点显然是 AF_INET（即互联网）socket。随着时间的推移，Linux/Unix 离开了服务器领域，在台式机，移动和嵌入式环境上变得越来越多。inetd 慢慢地陷入了麻烦。它的速度慢的特性，以及 Linux 的重心从互联网服务器移走的事实，使得运行 inetd（或其更新的实现之一，如 xinetd）的 Linux 机器成为少数，而不是标准。

When Apple engineers worked on optimizing the MacOS boot time they found a new way to make use of the idea of socket activation: they shifted the focus away from AF_INET sockets towards AF_UNIX sockets. And they noticed that on-demand socket activation was only part of the story: much more powerful is socket activation when used for all local services including those which need to be started anyway on boot. They implemented these ideas in launchd, a central building block of modern MacOS X systems, and probably the main reason why MacOS is so fast booting up.

当苹果工程师致力于优化 MacOS 引导时间时，他们发现了一种利用 socket 激活思想的新方法：他们将注意力从 AF_INET sockets 转移到 AF_UNIX sockets。他们注意到，按需的 socket 激活只是故事的一部分：当把 socket 激活用于所有本地服务（包括那些必须在启动时启动的服务）时，它的功能要强大得多。他们在 launchd 中实现了这些想法，launchd 是现代 macosx 系统的核心构建块，这可能是 MacOS 启动速度如此之快的主要原因。

But, before we continue, let's have a closer look what the benefits of socket activation for non-on-demand, non-Internet services in detail are. Consider the four services Syslog, D-Bus, Avahi and the Bluetooth daemon. D-Bus logs to Syslog, hence on traditional Linux systems it would get started after Syslog. Similarly, Avahi requires Syslog and D-Bus, hence would get started after both. Finally Bluetooth is similar to Avahi and also requires Syslog and D-Bus but does not interface at all with Avahi. Sinceoin a traditional SysV-based system only one service can be in the process of getting started at a time, the following serialization of startup would take place: Syslog → D-Bus → Avahi → Bluetooth (Of course, Avahi and Bluetooth could be started in the opposite order too, but we have to pick one here, so let's simply go alphabetically.). To illustrate this, here's a plot showing the order of startup beginning with system startup (at the top).

但是，在继续之前，让我们更详细地了解一下非按需、非互联网服务的 socket 激活的好处是什么。考虑一下 Syslog、D-Bus、Avahi 和蓝牙守护进程这四种服务。D-Bus 将日志记录到 Syslog，因此在传统的 Linux 系统上，它将在 Syslog 之后启动。类似地，Avahi 需要 Syslog 和 D-Bus，因此在这两者之后都会启动。最后，蓝牙类似于 Avahi，也需要 Syslog 和 D-Bus，但根本不与 Avahi 交互。由于在传统的基于 SysV 的系统中，一次只能启动一个服务，因此会发生以下启动序列化：Syslog→D-Bus→Avahi→Bluetooth（当然，Avahi 和 Bluetooth 也可以按相反的顺序启动，但我们必须在这里选择一个，所以我们就按字母顺序来吧。为了说明这一点，这里有一个图，显示了从系统启动开始的启动顺序。

[!Parallelization plot](http://0pointer.de/public/parallelization-small.png)

Certain distributions tried to improve this strictly serialized start-up: since Avahi and Bluetooth are independent from each other, they can be started simultaneously. The parallelization is increased, the overall startup time slightly smaller. (This is visualized in the middle part of the plot.)

某些发行版试图改进这种严格序列化的启动方式：由于 Avahi 和 Bluetooth 彼此独立，所以它们可以同时启动。并行化程度提高，整体启动时间略短。（这在图的中间部分可见。）

Socket activation makes it possible to start all four services completely simultaneously, without any kind of ordering. Since the creation of the listening sockets is moved outside of the daemons themselves we can start them all at the same time, and they are able to connect to each other's sockets right-away. I.e. in a single step the /dev/log and /run/dbus/system_bus_socket sockets are created, and in the next step all four services are spawned simultaneously. When D-Bus then wants to log to syslog, it just writes its messages to /dev/log. As long as the socket buffer does not run full it can go on immediately with what else it wants to do for initialization. As soon as the syslog service catches up it will process the queued messages. And if the socket buffer runs full then the client logging will temporarily block until the socket is writable again, and continue the moment it can write its log messages. That means the scheduling of our services is entirely done by the kernel: from the userspace perspective all services are run at the same time, and when one service cannot keep up the others needing it will temporarily block on their request but go on as soon as these requests are dispatched. All of this is completely automatic and invisible to userspace. Socket activation hence allows us to drastically parallelize start-up, enabling simultaneous start-up of services which previously were thought to strictly require serialization. Most Linux services use sockets as communication channel. Socket activation allows starting of clients and servers of these channels at the same time.

Socket 激活可以完全同时启动所有四个服务，不用按顺序启动。listening sockets 的创建在守护进程本身之外，我们可以同时启动进程，并且它们能够立即连接到彼此的socket。比如说, 在一个独立的步骤中，创建了 /dev/log 和 /run/dbus/system_bus_socket，下一步将同时生成所有四个服务。当 D-Bus 想要记录到 syslog 时，它只将其消息写入 /dev/log。只要socket缓冲区没有满负荷运行，它就可以立即执行它想进行初始化的其他操作。一旦 syslog 服务赶上，它就会处理排队的消息。如果 socket 缓冲区满了，那么客户机日志记录将暂时阻塞，直到 socket 再次可写为止，并在可以写入日志消息的那一刻继续。这意味着服务的调度完全由内核来完成：从用户空间的角度来看，所有服务都是同时运行的，当一个服务不能跟上依赖它的服务时，它将暂时阻塞它们的请求，但一旦这些请求被处理掉，它们就会继续运行。所有这些都是完全自动的，对用户空间是透明的。因此，Socket 激活允许我们极大地并行化启动，从而能够同时启动以前被认为严格要求序列化的服务。大多数 Linux 服务使用 socket 作为通信通道。 socket 激活允许同时启动这些通道的客户端和服务器。

But it's not just about parallelization. It offers a number of other benefits:

但这不仅仅是并行化。它还提供了许多其他好处：

- We no longer need to configure dependencies explicitly. Since the sockets are initialized before all services they are simply available, and no userspace ordering of service start-up needs to take place anymore. Socket activation hence drastically simplifies configuration and development of services.

  我们不再需要显式地配置依赖关系。由于 socket 是在所有服务之前初始化的，它们是可用的，所以不再需要对服务启动进行排序。因此， socket 激活大大简化了服务的配置和开发。

- If a service dies its listening socket stays around, not losing a single message. After a restart of the crashed service it can continue right where it left off.

  如果一个服务死了，它的侦听 socket 会一直存在，而不会丢失一条消息。重新启动崩溃的服务后，它可以继续在它停止的地方继续。

- If a service is upgraded we can restart the service while keeping around its sockets, thus ensuring the service is continously responsive. Not a single connection is lost during the upgrade.

  如果一个服务升级了，我们可以重新启动该服务，同时保持它的 socket ，从而确保该服务持续响应。升级过程中没有一个连接丢失。

- We can even replace a service during runtime in a way that is invisible to the client. For example, all systems running systemd start up with a tiny syslog daemon at boot which passes all log messages written to /dev/log on to the kernel message buffer. That way we provide reliable userspace logging starting from the first instant of boot-up. Then, when the actual rsyslog daemon is ready to start we terminate the mini daemon and replace it with the real daemon. And all that while keeping around the original logging socket and sharing it between the two daemons and not losing a single message. Since rsyslog flushes the kernel log buffer to disk after start-up all log messages from the kernel, from early-boot and from runtime end up on disk.

  我们甚至可以在运行时以客户端看不见的方式替换服务。例如，所有运行 systemd 的系统在启动时都会使用一个很小的 syslog 守护进程来启动，该守护进程将写入 /dev/log 的所有日志消息传递到内核消息缓冲区。这样我们就可以从启动的第一个瞬间开始提供可靠的用户空间日志记录。然后，当实际的 rsyslog 守护进程准备好启动时，我们终止迷你守护进程，并将其替换为真正的守护进程。所有这一切，同时保留原始日志 socket ，并在两个守护进程之间共享它，而不会丢失一条消息。由于 rsyslog 在启动后会将内核日志缓冲区刷新到磁盘上，因此来自内核的所有日志消息、从早期引导到运行时的日志消息都会在磁盘上结束。

For another explanation of this idea consult [the original blog story about systemd](http://0pointer.de/blog/projects/systemd.html).

关于这个想法的另一个解释，请参考关于 [systemd 的原始博客故事](http://0pointer.de/blog/projects/systemd.html)。

Socket activation has been available in systemd since its inception. On Fedora 15 a number of services have been modified to implement socket activation, including Avahi, D-Bus and rsyslog (to continue with the example above).

systemd 从一开始就使用了 socket 激活。在 Fedora15 上，许多服务更改为利用 socket 激活，包括 Avahi、D-Bus 和 rsyslog。

systemd's socket activation is quite comprehensive. Not only classic sockets are support but related technologies as well:

systemd 的 socket 激活非常全面。不仅支持经典 socket ，还支持其他相关技术：

- AF_UNIX sockets, in the flavours SOCK_DGRAM, SOCK_STREAM and SOCK_SEQPACKET; both in the filesystem and in the abstract namespace

  AF_UNIX sockets, in the flavours SOCK_DGRAM, SOCK_STREAM and SOCK_SEQPACKET; 不管是文件系统或者是抽象命名空间

- AF_INET sockets, i.e. TCP/IP and UDP/IP; both IPv4 and IPv6

  AF_INET socket ，即 TCP/IP 和 UDP/IP；包括 IPv4 和 IPv6

- Unix named pipes/FIFOs in the filesystem

  文件系统中的 Unix 命名管道 / FIFO

- AF_NETLINK sockets, to subscribe to certain kernel features. This is currently used by udev, but could be useful for other netlink-related services too, such as audit.

  AF_NETLINK sockets，用于订阅某些内核功能。目前 udev 正在使用这一功能，但它也可以用于其他与 netlink 相关的服务，例如 audit。

- Certain special files like /proc/kmsg or device nodes like /dev/input/*.

  某些特殊文件，如 /proc/kmsg 或设备节点，如 /dev/input/*。

- POSIX Message Queues

  POSIX 消息队列

A service capable of socket activation must be able to receive its preinitialized sockets from systemd, instead of creating them internally. For most services this requires (minimal) patching. However, since systemd actually provides inetd compatibility a service working with inetd will also work with systemd -- which is quite useful for services like sshd for example.

使用 socket 激活的服务必须使用从 systemd 预初始化的 socket，而不是在服务内部创建它们。对于大多数服务，这需要（最小）修补程序。不过呢，由于 systemd 提供了 inetd 兼容能力，一个使用 inetd 的服务也可以使用 systemd 工作 —— 这对于 sshd 这样的服务非常有用。

So much about the background of socket activation, let's now have a look how to patch a service to make it socket activatable. Let's start with a theoretic service foobard. (In a later blog post we'll focus on real-life example.)

关于 socket 激活的背景，我们就说到这里了. 现在让我们来看看如何对服务进行修补，使其能够使用socket 激活。让我们从一个理论服务 foobard 开始。（在稍后的博客文章中，我们将关注真实生活中的例子。）

Our little (theoretic) service includes code like the following for creating sockets (most services include code like this in one way or another):

我们的小型（理论上）服务包含以下代码用来创建 socket（大多数服务都以某种方式包含这样的代码）：

```
/* Source Code Example #1: ORIGINAL, NOT SOCKET-ACTIVATABLE SERVICE */
...
union {
        struct sockaddr sa;
        struct sockaddr_un un;
} sa;
int fd;

fd = socket(AF_UNIX, SOCK_STREAM, 0);
if (fd < 0) {
        fprintf(stderr, "socket(): %m\n");
        exit(1);
}

memset(&sa, 0, sizeof(sa));
sa.un.sun_family = AF_UNIX;
strncpy(sa.un.sun_path, "/run/foobar.sk", sizeof(sa.un.sun_path));

if (bind(fd, &sa.sa, sizeof(sa)) < 0) {
        fprintf(stderr, "bind(): %m\n");
        exit(1);
}

if (listen(fd, SOMAXCONN) < 0) {
        fprintf(stderr, "listen(): %m\n");
        exit(1);
}
...
```

A socket activatable service may use the following code instead:

端口激活服务可能会用下面这样的代码:

```
/* Source Code Example #2: UPDATED, SOCKET-ACTIVATABLE SERVICE */
...
#include "sd-daemon.h"
...
int fd;

if (sd_listen_fds(0) != 1) {
        fprintf(stderr, "No or too many file descriptors received.\n");
        exit(1);
}

fd = SD_LISTEN_FDS_START + 0;
...
```

systemd might pass you more than one socket (based on configuration, see below). In this example we are interested in one only. sd_listen_fds() returns how many file descriptors are passed. We simply compare that with 1, and fail if we got more or less. The file descriptors systemd passes to us are inherited one after the other beginning with fd #3. (SD_LISTEN_FDS_START is a macro defined to 3). Our code hence just takes possession of fd #3.

systemd 可能会向你传递多个 socket（这个依赖于配置，请参见下文）。在这个例子中，我们只对一个感兴趣。sd_listen_fds 返回传递了多少个文件描述符。我们只需将其与1进行比较，如果得到更多或更少，则失败。systemd 传递给我们的文件描述符从fd#3开始, 往上递增。（SD_LISTEN_FDS_START是一个定义为3的宏）。因此我们的代码把fd 设置成 3。 (这里我有点不明白, 写程序的人如果自己先创建了Socket呢? 还是说程序员要自己注意不要这样做?)

As you can see this code is actually much shorter than the original. This of course comes at the price that our little service with this change will no longer work in a non-socket-activation environment. With minimal changes we can adapt our example to work nicely both with and without socket activation:

如你所见，这段代码实际上比之前的代码(不使用socket activation的)要短得多。当然，这样做的代价是我们的服务在非socket激活环境中不再工作。只需稍加修改，我们就可以调整我们的示例，无论有没有socket激活都能很好地工作：

```
/* Source Code Example #3: UPDATED, SOCKET-ACTIVATABLE SERVICE WITH COMPATIBILITY */
...
#include "sd-daemon.h"
...
int fd, n;

n = sd_listen_fds(0);
if (n > 1) {
        fprintf(stderr, "Too many file descriptors received.\n");
        exit(1);
} else if (n == 1)
        fd = SD_LISTEN_FDS_START + 0;
else {
        union {
                struct sockaddr sa;
                struct sockaddr_un un;
        } sa;

        fd = socket(AF_UNIX, SOCK_STREAM, 0);
        if (fd < 0) {
                fprintf(stderr, "socket(): %m\n");
                exit(1);
        }

        memset(&sa, 0, sizeof(sa));
        sa.un.sun_family = AF_UNIX;
        strncpy(sa.un.sun_path, "/run/foobar.sk", sizeof(sa.un.sun_path));

        if (bind(fd, &sa.sa, sizeof(sa)) < 0) {
                fprintf(stderr, "bind(): %m\n");
                exit(1);
        }

        if (listen(fd, SOMAXCONN) < 0) {
                fprintf(stderr, "listen(): %m\n");
                exit(1);
        }
}
...
```

With this simple change our service can now make use of socket activation but still works unmodified in classic environments. Now, let's see how we can enable this service in systemd. For this we have to write two systemd unit files: one describing the socket, the other describing the service. First, here's foobar.socket:

通过这个简单的更改，我们的服务现在可以使用socket激活，但在经典环境中仍然可以正常工作。现在，让我们看看如何在systemd中启用此服务。为此，我们必须编写两个systemd单元文件：一个描述socket，另一个描述服务。首先看foobar.socket:

```
[Socket]
ListenStream=/run/foobar.sk

[Install]
WantedBy=sockets.target
```

下面是对应的服务描述文件 foobar.service:

```
[Service]
ExecStart=/usr/bin/foobard
```

If we place these two files in /etc/systemd/system we can enable and start them:

我们将这两个文件放在/etc/systemd/system中，就可以激活并启动它们：

```
# systemctl enable foobar.socket
# systemctl start foobar.socket
```

Now our little socket is listening, but our service not running yet. If we now connect to /run/foobar.sk the service will be automatically spawned, for on-demand service start-up. With a modification of foobar.service we can start our service already at startup, thus using socket activation only for parallelization purposes, not for on-demand auto-spawning anymore:

现在我们的 socket 正在监听，但是我们的服务还没有运行。如果我们现在连接 /run/foobar.sk 服务将自动创建，以便按需启动服务。像下面这样修改foobar.service 我们可以在启动时就启动服务，这种情况下只是将socket激活用于并行化目的，不再用于按需创建服务：


```
[Service]
ExecStart=/usr/bin/foobard

[Install]
WantedBy=multi-user.target
```

And now let's enable this too:

现在激活它:

```
# systemctl enable foobar.service
# systemctl start foobar.service
```

Now our little daemon will be started at boot and on-demand, whatever comes first. It can be started fully in parallel with its clients, and when it dies it will be automatically restarted when it is used the next time.

现在，我们的守护进程将在引导和按需启动时启动，无论哪个先启动。它完全可以和它的Client并行启动，当它挂了后，它将在下次被使用时自动重新启动。

A single .socket file can include multiple ListenXXX stanzas, which is useful for services that listen on more than one socket. In this case all configured sockets will be passed to the service in the exact order they are configured in the socket unit file. Also, you may configure various socket settings in the .socket files.

一个.socket文件可以包含多个 ListenXXX ，这对于侦听多个 socket 的服务很有用。在这种情况下，所有配置的 socket 都将按照它们在 socket 单元文件中的配置顺序传递给服务。此外，您可以在.socket文件中配置各种socket参数。

In real life it's a good idea to include description strings in these unit files, to keep things simple we'll leave this out of our example. Speaking of real-life: our next installment will cover an actual real-life example. We'll add socket activation to the CUPS printing server.

在现实生活中，在这些单元文件中包含描述字符串(这是啥?注释?)是一个好主意，为了简单起见，我们在示例中先不说这个。说到现实生活：我们的下一期将介绍一个实际的例子: 我们将向CUPS打印服务器添加socket激活。

The sd_listen_fds() function call is defined in sd-daemon.h and sd-daemon.c. These two files are currently drop-in .c sources which projects should simply copy into their source tree. Eventually we plan to turn this into a proper shared library, however using the drop-in files allows you to compile your project in a way that is compatible with socket activation even without any compile time dependencies on systemd. sd-daemon.c is liberally licensed, should compile fine on the most exotic Unixes and the algorithms are trivial enough to be reimplemented with very little code if the license should nonetheless be a problem for your project. sd-daemon.c contains a couple of other API functions besides sd_listen_fds() that are useful when implementing socket activation in a project. For example, there's sd_is_socket() which can be used to distuingish and identify particular sockets when a service gets passed more than one.

sd_listen_fds（）函数定义在 sd-daemon.h 和 sd-daemon.c 。目前,这两个文件是drop-in 源文件，只需将其复制到你的源代码中即可。最终，我们计划将其做成一个共享库，但是使用drop-in文件可以让您以一种与socket激活兼容的方式编译您的项目，即使在systemd上没有任何编译时依赖性。sd-daemon.c 是自由授权的，应该在最奇特的unix上也能编译得很好，如果许可证对你的项目是个问题的话，算法非常简单，你可以用很少的代码重新实现。sd-daemon.c除了sd_listen_fds（）之外，还包含两个其他API函数，这些函数在项目中实现 socket 激活时非常有用。例如，有一个sd_is_socket（），当一个服务被传递到多个 socket 时，它可以用来区分和标识特定的 socket。

Let me point out that the interfaces used here are in no way bound directly to systemd. They are generic enough to be implemented in other systems as well. We deliberately designed them as simple and minimal as possible to make it possible for others to adopt similar schemes.

我要指出，这里使用的接口绝不直接捆绑到 systemd。它们具有足够的通用性，可以在其他系统中实现。我们特意设计了尽可能简单和最小的方案，使其他人能够采用类似的方案。

Stay tuned for the next installment. As mentioned, it will cover a real-life example of turning an existing daemon into a socket-activatable one: the CUPS printing service. However, I hope this blog story might already be enough to get you started if you plan to convert an existing service into a socket activatable one. We invite everybody to convert upstream projects to this scheme. If you have any questions join us on #systemd on freenode.

请继续关注下一期。如前所述，本文将介绍一个将现有守护进程转换为可激活 socket 的守护进程的实例：CUPS打印服务。但是，如果您计划将现有服务转换为 socket 激活的服务，我希望这篇博客故事已经足够让你开始使用。我们邀请大家把 upstream 项目转化为这个方案。如果你有任何问题，请在 freenode #systemd 与我们联系。
