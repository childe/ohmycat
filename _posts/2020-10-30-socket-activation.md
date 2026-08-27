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

---

## 补充：Socket Activation 的设计动机、目的与可观测性

> 以下内容是对原文的补充，帮助读者更好地理解 Socket Activation 功能背后的设计思路，以及在日常运维中如何观测和调试这一机制。

### 一、为什么 systemd 要引入 Socket Activation？

#### 1.1 核心问题：传统启动模型的瓶颈

在 systemd 之前，Linux 服务的启动方式主要有两种：

- **SysV init（启动时全部拉起）**：所有 enable 的服务在开机时由 rc 脚本顺序启动，一次只能启动一个，即使没人使用也要占用内存和 CPU。
- **inetd/xinetd（超级守护进程按需拉起）**：一个守护进程代替真实服务监听，有连接时才 fork/exec 出真实服务。

需要澄清一个常见误解：**inetd 并非只能监听 TCP/UDP**。BSD 系 inetd 的 `inetd.conf` 中把 protocol 字段写成 `unix`，service-name 字段写成路径，就能监听 Unix domain socket。inetd 真正的局限在于它的**重心始终是"网络服务"这一类**——它不管 FIFO、netlink、POSIX 消息队列、设备节点，更不参与系统整体启动的并行化；再加上 nowait 模式下每个连接 fork 一次的开销，让它落下了"慢"的名声（这也是原文第三、四段的论点）。

#### 1.2 设计动机

Lennart Poettering 在 2010 年的 [Rethinking PID 1](http://0pointer.de/blog/projects/systemd.html) 中明确说明了灵感来源：*"The most prominent system that works like this is Apple's launchd system: on MacOS the listening of the sockets is pulled out of all daemons"*。launchd 随 Mac OS X 10.4（2005 年）发布，Apple 官方文档把这种方式称为 on-demand launching。systemd 把它作为核心机制之一，动机包括：

| 动机 | 说明 |
|------|------|
| **最大化并行化**（首要动机） | socket 的创建（`socket()` + `bind()` + `listen()`）被从守护进程里剥离出来、提前在 PID 1 中完成，因此所有服务可以同时启动，无需按依赖关系排序。内核负责调度——socket buffer 满时客户端自动阻塞，服务处理完后自动恢复。 |
| **消除显式依赖配置** | socket 在所有服务之前就绪，unit 文件里不再需要写 `After=`/`Requires=` 这类启动顺序，配置和服务开发都大幅简化。 |
| **按需启动、减少内存占用** | 不需要立即使用的服务不必在开机时启动；空闲服务消耗零内存。在嵌入式、桌面，以及"大量低频服务"的服务器/容器场景上尤为关键。 |
| **崩溃后透明恢复** | 服务崩溃时监听 socket 由 PID 1 持有、不会被关闭，内核 backlog 中排队但尚未 `accept()` 的连接依然在，下次触发时 systemd 重新拉起服务即可继续处理。**注意**：已经 `accept()` 并交给旧进程的连接仍然会随进程死亡而断开，"不丢一个连接"只对尚未被取走的那部分成立。 |
| **重启/升级期间可用** | 重启服务进程而保留 socket，客户端在这期间只是阻塞而不是收到 `ECONNREFUSED`。daemon(7) 的表述是：对 DNS、syslog 这类无状态协议甚至可以做到一个请求都不丢。 |
| **特权分离** | 监听 socket 由 PID 1（root）创建并 bind，服务进程可以用 `User=` 降权运行；即使监听 1024 以下端口，服务自身也不需要 root 或 `CAP_NET_BIND_SERVICE`。AF_UNIX socket 的属主与权限另有 `SocketUser=`/`SocketGroup=`/`SocketMode=` 控制。 |
| **替代 inetd/xinetd** | 提供通用的 super-server 替代方案，并保留 inetd 兼容（`StandardInput=socket`）。覆盖面远大于 inetd：stream/datagram/seqpacket、FIFO、netlink、POSIX 消息队列、设备节点、USB function 等。 |

需要强调的是，**并行化才是 systemd 引入 socket activation 的首要动机，按需启动只是顺带的收益**——这一点和 inetd 恰好相反。原文里 Syslog → D-Bus → Avahi → Bluetooth 那张串行启动图，说的就是这件事。

#### 1.3 核心设计哲学

关键洞察是**关注点分离（Separation of Concerns）**：socket（对外接口）属于系统/init 层面，而 service（业务逻辑）只在需要时才启动。从客户端视角看，**"socket 即服务"**——socket 始终存在，即使背后的服务进程尚未运行。

这套"提前建立通道、延迟启动实现"的模型并不止用于 socket：systemd 里还有 timer、path、device、D-Bus 等多种 activation，socket activation 只是其中最主要的一种。

#### 1.4 两种模式：`Accept=no` 与 `Accept=yes`

这是理解 socket activation 最关键、也最容易被忽略的一点，它决定了**到底往服务里传什么 fd**，也决定了后面能观测到哪些指标。

| | `Accept=no`（**默认**） | `Accept=yes` |
|---|---|---|
| 传给服务的 fd | **监听 socket 本身** | **已经 accept 好的连接 socket** |
| 服务实例数 | 只启动一个实例，处理所有连接 | 每个连接一个实例，需要 `foo@.service` 模板单元 |
| 谁调用 `accept()` | 服务自己 | systemd（PID 1） |
| 对应 inetd 的 | `wait` | `nowait` |
| 典型用法 | 现代常驻服务（docker、journald、大多数自研服务） | 传统 inetd 风格服务（sshd、telnet 类） |
| 默认 fd 名称 | socket 单元名（含 `.socket` 后缀） | `connection` |

`Accept=yes` 的典型例子来自 Lennart 的 [systemd for Administrators, Part XI](http://0pointer.de/blog/projects/inetd.html)：

```ini
# sshd.socket
[Unit]
Description=SSH Socket for Per-Connection Servers

[Socket]
ListenStream=22
Accept=yes

[Install]
WantedBy=sockets.target
```

```ini
# sshd@.service
[Unit]
Description=SSH Per-Connection Server

[Service]
ExecStart=-/usr/sbin/sshd -i
StandardInput=socket
```

其中 `StandardInput=socket` 就是 inetd 兼容开关：连接 socket 被放到 stdin/stdout，未经修改的 inetd 服务（`sshd -i`）可以直接跑。

另外几个和模式相关的配置：`MaxConnections=`（默认 64）和 `MaxConnectionsPerSource=`（默认 0，即不限）**只对 `Accept=yes` 生效**；datagram socket 和 FIFO 则无条件由单个服务实例处理，`Accept=` 被忽略。

#### 1.5 工作流程概览

```
1. 系统启动 / systemd reload
   └─ systemd 读取 .socket 单元文件

2. systemd 创建 socket
   └─ 调用 socket() + bind() + listen()
   └─ 此时尚无服务进程运行！

3. systemd 通过 epoll 等待事件

4. 客户端连接 / 发送数据
   └─ epoll 触发，systemd 被唤醒

5. systemd 启动关联的 .service
   └─ fork + exec 服务进程
   └─ 在 exec 之前把要传的 fd dup 到 3, 4, 5 …（连续排列）
   └─ 设置环境变量:
        LISTEN_FDS      = 传递的 fd 数量
        LISTEN_PID      = 服务进程 PID（防止 fd 被子进程误用）
        LISTEN_FDNAMES  = fd 名称（冒号分隔，来自 FileDescriptorName=）

6. 服务继承 fd，调用 accept()/recv() 处理请求
   └─ Accept=no：fd 3 是监听 socket，服务自己 accept()
   └─ Accept=yes：fd 3 是连接 socket，直接读写即可
```

> **回答原文译注里的疑问**（"写程序的人如果自己先创建了 socket 呢？"）：不会冲突。fd 的编号是 systemd 在 `exec()` **之前**安排好的——那时业务代码一行都还没跑，进程里只有 0/1/2 三个标准 fd，所以传入的 fd 必然从 3 开始连续排列。服务自己后来创建的 socket 只会拿到更大的编号。真正需要程序员注意的只有两点：一是先调 `sd_listen_fds()` 再做别的（它会顺手把 `LISTEN_*` 环境变量 unset 掉，避免被子进程继承误判），二是别去 `close()` 掉 fd 3。另外 `sd_listen_fds()` 会给传入的 fd 设上 `FD_CLOEXEC`。

---

### 二、可观测性：如何查看和调试 Socket Activation

#### 2.1 `systemctl list-sockets` — 全局概览

这是查看 socket activation 状态最实用的命令：

```bash
# 列出所有活跃的 socket
systemctl list-sockets

# 输出示例：
# LISTEN                          UNIT                        ACTIVATES
# /run/dbus/system_bus_socket     dbus.socket                 dbus.service
# /run/systemd/journal/socket     systemd-journald.socket     systemd-journald.service
# [::]:22                         sshd.socket                 sshd@.service
# /run/docker.sock                docker.socket               docker.service

# 显示所有 socket（包括未激活的）
systemctl list-sockets --all

# 按 unit 名字模式过滤
systemctl list-sockets 'systemd-*'

# 额外显示 socket 类型（Stream / Datagram / SequentialPacket / FIFO …）
systemctl list-sockets --show-types

# 显示完整地址，不做省略
systemctl list-sockets --full
```

注意 `ACTIVATES` 一列：如果显示的是 `foo@.service` 这样的模板单元，说明这个 socket 是 `Accept=yes`（每连接一个实例）。

另外 `-t/--type=` 在 systemctl 里是**按 unit 类型过滤**（service、socket、timer…），不是按 socket 类型过滤，`systemctl list-sockets -t stream` 是无效的；要看 socket 类型请用 `--show-types`。

#### 2.2 `systemctl status <socket>` — 查看单个 socket 状态

```bash
systemctl status sshd.socket

# 输出示例（Accept=yes 的 socket）：
# ● sshd.socket - OpenSSH Server Socket
#      Loaded: loaded (/usr/lib/systemd/system/sshd.socket; enabled; preset: disabled)
#      Active: active (listening) since Mon 2026-08-25 10:00:00 UTC; 2 days ago
#    Triggers: ● sshd@.service
#      Listen: [::]:22 (Stream)
#    Accepted: 142; Connected: 3;   Refused: 1

# 查看 socket 单元的详细属性
systemctl show sshd.socket

# 查看关键属性：关联的服务、监听地址、模式等
systemctl show sshd.socket -p ListenStream,Accept,Service,Triggers,MaxConnections

# 计数器也可以直接以属性方式读出（便于脚本/监控采集）
systemctl show sshd.socket -p NAccepted,NConnections,NRefused
```

`Triggers:`（socket → 它会拉起谁）和 `TriggeredBy:`（service → 它被谁拉起）是一对反向指针，`systemctl status` 会直接把它们和对端的活跃状态一起打出来，比 `systemctl show -p` 更直观。

`Accepted`/`Connected`/`Refused` 三个计数器很有价值，但**它们的语义容易被误解**，对照 systemd 源码（`src/core/socket.c`、`src/systemctl/systemctl-show.c`）说明如下：

- **Accepted**（`NAccepted`）= systemd 累计代为 `accept()` 并交给服务实例的连接数，是**累计值**。
- **Connected**（`NConnections`）= **当前**还活着的连接实例数，是**瞬时值**，不是累计值。它受 `MaxConnections=`（默认 64）约束。
- **Refused**（`NRefused`）= 被拒绝的连接数。触发原因有三种：超过 `MaxConnections=`、超过 `MaxConnectionsPerSource=`、或者撞上下面 2.3 要讲的触发限流。日志里对应 `Too many incoming connections (N), dropping connection.` 之类的 warning。

**最重要的一条**：这三个计数器只在 `Accept=yes` 时才会被累加，`systemctl status` 也只在 `Accept=yes` 时才打印这一行。也就是说，**默认的 `Accept=no` 服务（大多数现代服务）根本看不到连接数统计**——因为 `accept()` 是服务自己做的，systemd 压根不知道来了多少连接。想统计这类服务的连接量，只能靠服务自身埋点，或者用 `ss -s`、conntrack、eBPF 之类的手段。

#### 2.3 触发限流：socket 为什么突然"连不上了"

这是生产上最容易踩、又最难自己想明白的一个坑，值得单独讲。

systemd 对 socket 单元的**激活频率**有限流（`systemd.socket(5)`）：

- `TriggerLimitIntervalSec=`，默认 **2s**
- `TriggerLimitBurst=`，默认 **200**（`Accept=yes`）/ **20**（其他情况，也就是默认的 `Accept=no`）

文档原话是：*"If the limit is hit, the socket unit is placed into a failure mode, and will not be connectible anymore until restarted."* —— 注意是 **socket 单元本身进入 failed 状态并且不再接受连接，直到你手工重启它**。所以现象会非常迷惑：端口没了、服务也没起、但机器一切正常。

典型场景：服务启动即崩溃 → systemd 反复被连接触发去拉起它 → 2 秒内超过 20 次 → socket 直接失败。

```bash
# 现象
systemctl status myapp.socket
# ● myapp.socket - My App Socket
#      Active: failed (Result: trigger-limit-hit)

# 日志里的关键行
journalctl -u myapp.socket | grep -i "trigger limit"
# myapp.socket: Trigger limit hit, refusing further activation.

# 恢复
systemctl reset-failed myapp.socket
systemctl restart myapp.socket
```

真要放宽（先确认根因是突发流量而不是服务本身起不来）：

```ini
[Socket]
TriggerLimitIntervalSec=30s
TriggerLimitBurst=100
```

新版本 systemd 还有一组更温和的 `PollLimitIntervalSec=`/`PollLimitBurst=`（默认每 2s 150 次 / 15 次），撞上时只是**暂时降速**处理 poll 事件，不会把单元打成 failed，可以用来抗抖动。

#### 2.4 `journalctl` — 日志追踪

```bash
# 查看 socket 单元的日志
journalctl -u sshd.socket

# 查看 socket 触发的服务的日志
journalctl -u sshd.service

# 同时查看 socket 和 service 的日志（排查激活过程最有用）
journalctl -u sshd.socket -u sshd.service

# 实时追踪激活过程
journalctl -u sshd.socket -u sshd.service -f

# 查看 systemd 自身的 socket activation 相关日志
journalctl _COMM=systemd | grep -i "socket\|activat"
```

#### 2.5 `ss` — 查看内核 socket 表

```bash
# 查看所有 TCP 监听 socket 及其所属进程
ss -tlnp

# 查看 Unix Domain Socket
ss -xlnp

# 查看 socket 扩展信息（uid、inode、cgroup 等）
ss -tlnpe

# 查看某个端口的归属
ss -tlnp | grep 8080

# 查看 Unix socket 的 inode（可与 systemd 对应）
ss -xlnp | grep myapp
# 输出示例：
# u_str  LISTEN  0  128  /run/myapp.sock 12345 * 0  users:(("systemd",pid=1,fd=42))
```

这里有个**判断 socket activation 是否生效的最直接证据**：看监听 socket 的持有者。

- 服务尚未被拉起时，监听 socket 只属于 `systemd`（PID 1）：`users:(("systemd",pid=1,fd=42))`
- 服务被拉起后，同一个 socket 会同时出现在 PID 1 和服务进程名下（fd 被 dup 过去了），而不是服务自己重新 bind 了一个

如果你看到监听 socket **只**属于业务进程、PID 1 完全不持有，那基本可以断定服务在自己 `bind()`，socket activation 根本没生效（常见于代码里没走 `sd_listen_fds()`、或者 unit 里 enable 的是 `.service` 而不是 `.socket`）。

另一个实用观察点：对处于 `LISTEN` 状态的 TCP socket，`ss -ltn` 的 `Recv-Q` 是**当前已完成三次握手、等待被 `accept()` 取走的连接数**，`Send-Q` 是 backlog 上限。服务正在启动的那几百毫秒里 `Recv-Q` 会短暂 > 0，这正是原文说的"内核帮你缓冲请求"的可视化证据；如果它长期贴着 `Send-Q`，说明服务 accept 不过来了。

#### 2.6 `lsof` — 文件描述符检查

```bash
# 查看谁占用了某个端口
lsof -i :8080

# 查看某个进程的 socket fd
lsof -p <service-pid> | grep socket

# 查看 Unix socket
lsof -U | grep myapp
```

#### 2.7 判断一个服务是否真的由 socket activation 拉起

第一步先看单元关系：

```bash
# 查看服务是被谁触发的
systemctl show myapp.service -p TriggeredBy
# 输出: TriggeredBy=myapp.socket

# 查看 socket 会拉起谁（对 Accept=yes 和 Accept=no 都有效）
systemctl show myapp.socket -p Triggers

# Service= 只对 Accept=no 有意义（Accept=yes 时不允许配置该项）
systemctl show myapp.socket -p Service
```

第二步是**从进程侧拿实锤**，证明 fd 确实是继承来的而不是自己 bind 的：

```bash
PID=$(systemctl show myapp.service -p MainPID --value)

# 1) fd 3 应该是一个 socket
ls -l /proc/$PID/fd/3
# lrwx------ 1 root root 64 Aug 27 10:00 /proc/$PID/fd/3 -> 'socket:[123456]'

# 2) 把 inode 号和内核 socket 表对上，确认就是那个监听 socket
ss -xlnpe | grep 123456     # Unix socket
ss -tlnpe | grep 123456     # TCP socket

# 3) 环境变量（注意：只有服务没调用 sd_listen_fds(1) 时才看得到）
tr '\0' '\n' < /proc/$PID/environ | grep '^LISTEN_'
# LISTEN_FDS=1
# LISTEN_PID=4242
# LISTEN_FDNAMES=myapp.socket
```

关于第 3 点要特别说明：`sd_listen_fds(1)` 的参数 `unset_environment` 为非 0 时会把 `LISTEN_FDS`、`LISTEN_PID`、`LISTEN_FDNAMES` 从环境里删掉（避免被子进程继承后误判），而绝大多数实现都是这么调的。所以**这里查不到 `LISTEN_*` 反而说明服务正确使用了 sd-daemon API**；查得到通常意味着服务还没来得及调用、或者根本没在用这套 API。别把它当成"没生效"的判据，判据以第 1、2 步为准。

#### 2.8 `systemd-socket-activate` — 不写 unit 文件也能本地验证

systemd 自带一个测试工具（v230 起提供），可以在命令行里模拟 systemd 传 fd 的行为，用来验证自己的程序有没有正确实现 `sd_listen_fds()`，非常适合开发阶段：

```bash
# Accept=no 风格：把监听 socket 传给程序，程序自己 accept
systemd-socket-activate -l 8080 ./myapp

# Accept=yes / inetd 风格：每个连接 fork 一个实例，连接 socket 放在 stdin/stdout
systemd-socket-activate -l 2000 --inetd -a cat

# 指定 fd 名称，验证 sd_listen_fds_with_names()
systemd-socket-activate -l 8080 --fdname=myapp ./myapp
```

它会在启动子进程前把 `LISTEN_FDS`/`LISTEN_PID`/`LISTEN_FDNAMES` 设好、fd 从 3 开始排好，行为与 PID 1 一致。

#### 2.9 启用调试日志

`systemctl set-environment` 设置的是**传给被拉起进程**的环境变量，不会改变 PID 1 自己的日志级别，所以调 systemd 自身的日志要用下面这些方式：

```bash
# 方式一：官方命令（systemd v244+）
systemctl log-level debug
systemctl log-level          # 查看当前级别
systemctl log-level info     # 调回来

# 方式二：信号（不依赖 systemctl，救急可用）
kill -SIGRTMIN+22 1          # 等价于 systemd.log_level=debug
kill -SIGRTMIN+23 1          # 恢复为配置值

# 实时观察 activation 事件
journalctl -f _PID=1
```

开机阶段的问题只能在内核命令行上开（systemd 官方 DEBUGGING 文档的推荐做法）：

```
systemd.log_level=debug systemd.log_target=kmsg log_buf_len=1M printk.devkmsg=on
```

也可以在 `/etc/systemd/system.conf` 中持久配置：

```ini
[Manager]
LogLevel=debug
```

#### 2.10 从启动耗时的角度看 socket activation

socket activation 的首要卖点是并行化，验收也该落在启动时间上：

```bash
# 各单元初始化耗时排序
systemd-analyze blame

# 关键路径（谁在拖慢 boot）
systemd-analyze critical-chain
systemd-analyze critical-chain myapp.service

# 总览 / 生成启动时序 SVG
systemd-analyze time
systemd-analyze plot > boot.svg
```

如果一个服务改造成 socket activation 之后仍然出现在 `critical-chain` 上，说明有别的单元在显式 `After=` 它，并行化的收益并没有拿到。

顺带一提，和"重启不丢状态"相关的还有 fd store：服务可以通过 `sd_notify(0, "FDSTORE=1")` 把 fd 寄存在 PID 1 里跨重启保留（`FileDescriptorStoreMax=`），当前内容可以用 `systemd-analyze fdstore <unit>` 查看（v250 起）。

#### 2.11 常见排查场景速查

| 我想… | 命令 |
|--------|------|
| 查看 systemd 正在监听哪些 socket | `systemctl list-sockets --show-types` |
| 某个 socket 是否活跃 | `systemctl status <name>.socket`（`active (listening)`） |
| socket 会激活哪个服务 | `systemctl show <name>.socket -p Triggers` |
| 某个运行中的服务是被什么触发的 | `systemctl show <name>.service -p TriggeredBy` |
| 这个 socket 是哪种模式 | `systemctl show <name>.socket -p Accept` |
| 内核 socket 表的状态 | `ss -tlnpe` / `ss -xlnpe` |
| 激活过程中发生了什么 | `journalctl -u <name>.socket -u <name>.service` |
| socket 处理了多少连接（**仅 Accept=yes**） | `systemctl show <name>.socket -p NAccepted,NConnections,NRefused` |
| socket 挂了是不是撞了触发限流 | `systemctl show <name>.socket -p Result`（`trigger-limit-hit`） |
| 进程持有哪些 fd / fd 3 是不是继承来的 | `ls -l /proc/<pid>/fd/3`、`lsof -p <pid>` |
| 开发阶段验证程序是否支持 socket activation | `systemd-socket-activate -l <port> ./myapp` |
| 深入查看 systemd 内部状态 | 见下方 busctl |

`busctl` 的对象路径容易写错：是 `/org/freedesktop/systemd1/unit/...`（注意是 **systemd1**，不是 `systemd`），而且单元名要做转义（`.` → `_2e`，`-` → `_2d`）。与其手拼，不如让 systemd 自己告诉你：

```bash
# 先取对象路径
busctl call org.freedesktop.systemd1 /org/freedesktop/systemd1 \
    org.freedesktop.systemd1.Manager GetUnit s myapp.socket
# o "/org/freedesktop/systemd1/unit/myapp_2esocket"

# 再 introspect / 读属性
busctl introspect org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/myapp_2esocket
busctl get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/myapp_2esocket \
    org.freedesktop.systemd1.Socket NAccepted
```

**场景：连接来了但服务没有启动？**

```bash
# 1. socket 是否在监听？是不是已经进了 failed？
systemctl status myapp.socket
systemctl show myapp.socket -p ActiveState,Result
ss -tlnp | grep myapp

# 2. 查看错误日志（socket 和 service 一起看）
journalctl -u myapp.socket -u myapp.service --no-pager -n 50

# 3. 常见根因排查
systemctl show myapp.socket -p Triggers      # 要拉起的单元存在吗、名字对不对
systemctl is-enabled myapp.socket            # enable 的是 .socket 而不是 .service？
journalctl -u myapp.socket | grep -i "trigger limit"   # 撞限流了？

# 4. 手动触发并实时观察
journalctl -u myapp.service -f &
echo "test" | nc localhost 8080
```

几个高频原因，按出现频率排序：

1. `systemctl enable myapp.service` 却没 enable `myapp.socket`——开机后根本没人在监听。
2. 服务代码仍然自己 `bind()` 同一个地址，和 PID 1 抢，报 `Address already in use`。
3. `Accept=yes` 但只写了 `myapp.service`，没写模板单元 `myapp@.service`。
4. 服务起来就退出 → 反复触发 → 撞上 `TriggerLimitBurst`，socket 进入 failed（见 2.3）。
5. 服务里用了 `sd_listen_fds()` 但在此之前 fork 过子进程，`LISTEN_PID` 对不上，`sd_listen_fds()` 返回 0。

---

## 参考资料

**上游作者的原始设计文档**（socket activation 的"为什么"，第一手来源）

- Lennart Poettering, [Rethinking PID 1](http://0pointer.de/blog/projects/systemd.html)（2010-04-30）— systemd 的设计宣言，socket activation 的最初论证与 launchd 渊源都在这里
- Lennart Poettering, [systemd for Developers I](http://0pointer.de/blog/projects/socket-activation.html) — 即本文原文
- Lennart Poettering, [systemd for Developers II](http://0pointer.de/blog/projects/socket-activation2.html) — 把 CUPS 改造成 socket activation 的实战
- Lennart Poettering, [systemd for Administrators, Part XI: Converting inetd Services](http://0pointer.de/blog/projects/inetd.html) — `Accept=yes` / inetd 兼容、`wait`↔`nowait` 的对应关系
- Lennart Poettering, [systemd for Administrators, Part XX: Socket Activated Internet Services and OS Containers](http://0pointer.de/blog/projects/socket-activated-containers.html)（2013-01-09）— 把 socket activation 推广到整个容器

**systemd 官方 man page / 文档**

- [systemd.socket(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html) — `Accept=`、`Service=`、`FileDescriptorName=`、`MaxConnections=`、`TriggerLimitIntervalSec=`/`TriggerLimitBurst=`、`PollLimit*=` 的权威定义
- [sd_listen_fds(3)](https://www.freedesktop.org/software/systemd/man/latest/sd_listen_fds.html) — `SD_LISTEN_FDS_START`、`LISTEN_FDS`/`LISTEN_PID`/`LISTEN_FDNAMES`、`unset_environment` 语义
- [daemon(7)](https://www.freedesktop.org/software/systemd/man/latest/daemon.html) — "New-Style Daemons" 与 socket-based activation 的收益
- [systemctl(1)](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html) — `list-sockets`、`--show-types`、`log-level`
- [systemd-socket-activate(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-socket-activate.html) — 命令行测试工具
- [systemd-socket-proxyd(8)](https://www.freedesktop.org/software/systemd/man/latest/systemd-socket-proxyd.html) — 给"改不动代码"的服务套一层代理，也能吃到 socket activation
- [systemd(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd.html) — `SIGRTMIN+22`/`SIGRTMIN+23`、`$SYSTEMD_LOG_LEVEL`
- [systemd-analyze(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-analyze.html) — `blame`、`critical-chain`、`plot`、`fdstore`
- [org.freedesktop.systemd1(5)](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html) — D-Bus 上的 `NAccepted`/`NConnections`/`NRefused` 等属性与对象路径转义规则
- [systemd DEBUGGING 文档](https://systemd.io/DEBUGGING/) — 开机阶段的调试手段

**源码**（计数器语义、限流行为的最终依据）

- [`src/core/socket.c`](https://github.com/systemd/systemd/blob/main/src/core/socket.c) — `socket_enter_running()` 中 `n_accepted`/`n_connections`/`n_refused` 的累加位置
- [`src/systemctl/systemctl-show.c`](https://github.com/systemd/systemd/blob/main/src/systemctl/systemctl-show.c) — `systemctl status` 打印 `Listen:`/`Accepted:`/`Triggers:` 的逻辑

**其他系统的对照**

- Apple, [Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) — launchd 的 `Sockets` key 与 on-demand launching，systemd 的思路来源
- Debian, [inetd.conf(5)](https://manpages.debian.org/bookworm/openbsd-inetd/inetd.conf.5.en.html) — 佐证 inetd 也能监听 Unix domain socket（protocol 字段写 `unix`）
