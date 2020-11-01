---

date: 2020-10-30T14:40:51+0800
title: 'socket activation'
layout: post

---

systemd for Developers I

systemd not only brings improvements for administrators and users, it also brings a (small) number of new APIs with it. In this blog story (which might become the first of a series) I hope to shed some light on one of the most important new APIs in systemd: Socket Activation

systemd 不仅为管理员和用户带来了改进，还带来了少量的新 api。在这个博客故事中（可能成为本系列文章的第一篇），我希望能对 systemd 中最重要的一个新 api 做一个分享：Socket Activation

In the original blog story about systemd I tried to explain why socket activation is a wonderful technology to spawn services. Let's reiterate the background here a bit.

在关于 systemd 的最开始的博客故事中，我试图解释为什么 socket activation 是一种神奇的服务创建技术。让我们在这里再介绍一下背景。

The basic idea of socket activation is not new. The inetd superserver was a standard component of most Linux and Unix systems since time began: instead of spawning all local Internet services already at boot, the superserver would listen on behalf of the services and whenever a connection would come in an instance of the respective service would be spawned. This allowed relatively weak machines with few resources to offer a big variety of services at the same time. However it quickly got a reputation for being somewhat slow: since daemons would be spawned for each incoming connection a lot of time was spent on forking and initialization of the services -- once for each connection, instead of once for them all.

Socket Activation 的基本思想并不是新的。inetd 从一开始就是大多数 Linux 和 Unix 系统的一个标准组件：它不在系统启动时生成所有本地 Internet 服务，而是代表服务进行监听，每当连接到来时，都会生成相应服务的实例。这使得资源较少的相对较弱的机器能够同时提供各种各样的服务。然而，它很快就以速度慢而闻名：因为每个传入的连接都会产生守护进程，所以在服务创建和初始化上花费了大量时间 —— 每个新的连接都会创建和初始化一次，而不是所有连接只创建一次。

Spawning one instance per connection was how inetd was primarily used, even though inetd actually understood another mode: on the first incoming connection it would notice this via poll() (or select()) and spawn a single instance for all future connections. (This was controllable with the wait/nowait options.) That way the first connection would be slow to set up, but subsequent ones would be as fast as with a standalone service. In this mode inetd would work in a true on-demand mode: a service would be made available lazily when it was required.

inetd's focus was clearly on AF_INET (i.e. Internet) sockets. As time progressed and Linux/Unix left the server niche and became increasingly relevant on desktops, mobile and embedded environments inetd was somehow lost in the troubles of time. Its reputation for being slow, and the fact that Linux' focus shifted away from only Internet servers made a Linux machine running inetd (or one of its newer implementations, like xinetd) the exception, not the rule.

When Apple engineers worked on optimizing the MacOS boot time they found a new way to make use of the idea of socket activation: they shifted the focus away from AF_INET sockets towards AF_UNIX sockets. And they noticed that on-demand socket activation was only part of the story: much more powerful is socket activation when used for all local services including those which need to be started anyway on boot. They implemented these ideas in launchd, a central building block of modern MacOS X systems, and probably the main reason why MacOS is so fast booting up.

But, before we continue, let's have a closer look what the benefits of socket activation for non-on-demand, non-Internet services in detail are. Consider the four services Syslog, D-Bus, Avahi and the Bluetooth daemon. D-Bus logs to Syslog, hence on traditional Linux systems it would get started after Syslog. Similarly, Avahi requires Syslog and D-Bus, hence would get started after both. Finally Bluetooth is similar to Avahi and also requires Syslog and D-Bus but does not interface at all with Avahi. Sinceoin a traditional SysV-based system only one service can be in the process of getting started at a time, the following serialization of startup would take place: Syslog → D-Bus → Avahi → Bluetooth (Of course, Avahi and Bluetooth could be started in the opposite order too, but we have to pick one here, so let's simply go alphabetically.). To illustrate this, here's a plot showing the order of startup beginning with system startup (at the top).

Parallelization plot
Certain distributions tried to improve this strictly serialized start-up: since Avahi and Bluetooth are independent from each other, they can be started simultaneously. The parallelization is increased, the overall startup time slightly smaller. (This is visualized in the middle part of the plot.)

Socket activation makes it possible to start all four services completely simultaneously, without any kind of ordering. Since the creation of the listening sockets is moved outside of the daemons themselves we can start them all at the same time, and they are able to connect to each other's sockets right-away. I.e. in a single step the /dev/log and /run/dbus/system_bus_socket sockets are created, and in the next step all four services are spawned simultaneously. When D-Bus then wants to log to syslog, it just writes its messages to /dev/log. As long as the socket buffer does not run full it can go on immediately with what else it wants to do for initialization. As soon as the syslog service catches up it will process the queued messages. And if the socket buffer runs full then the client logging will temporarily block until the socket is writable again, and continue the moment it can write its log messages. That means the scheduling of our services is entirely done by the kernel: from the userspace perspective all services are run at the same time, and when one service cannot keep up the others needing it will temporarily block on their request but go on as soon as these requests are dispatched. All of this is completely automatic and invisible to userspace. Socket activation hence allows us to drastically parallelize start-up, enabling simultaneous start-up of services which previously were thought to strictly require serialization. Most Linux services use sockets as communication channel. Socket activation allows starting of clients and servers of these channels at the same time.

But it's not just about parallelization. It offers a number of other benefits:

We no longer need to configure dependencies explicitly. Since the sockets are initialized before all services they are simply available, and no userspace ordering of service start-up needs to take place anymore. Socket activation hence drastically simplifies configuration and development of services.
If a service dies its listening socket stays around, not losing a single message. After a restart of the crashed service it can continue right where it left off.
If a service is upgraded we can restart the service while keeping around its sockets, thus ensuring the service is continously responsive. Not a single connection is lost during the upgrade.
We can even replace a service during runtime in a way that is invisible to the client. For example, all systems running systemd start up with a tiny syslog daemon at boot which passes all log messages written to /dev/log on to the kernel message buffer. That way we provide reliable userspace logging starting from the first instant of boot-up. Then, when the actual rsyslog daemon is ready to start we terminate the mini daemon and replace it with the real daemon. And all that while keeping around the original logging socket and sharing it between the two daemons and not losing a single message. Since rsyslog flushes the kernel log buffer to disk after start-up all log messages from the kernel, from early-boot and from runtime end up on disk.
For another explanation of this idea consult the original blog story about systemd.

Socket activation has been available in systemd since its inception. On Fedora 15 a number of services have been modified to implement socket activation, including Avahi, D-Bus and rsyslog (to continue with the example above).

systemd's socket activation is quite comprehensive. Not only classic sockets are support but related technologies as well:

AF_UNIX sockets, in the flavours SOCK_DGRAM, SOCK_STREAM and SOCK_SEQPACKET; both in the filesystem and in the abstract namespace
AF_INET sockets, i.e. TCP/IP and UDP/IP; both IPv4 and IPv6
Unix named pipes/FIFOs in the filesystem
AF_NETLINK sockets, to subscribe to certain kernel features. This is currently used by udev, but could be useful for other netlink-related services too, such as audit.
Certain special files like /proc/kmsg or device nodes like /dev/input/*.
POSIX Message Queues
A service capable of socket activation must be able to receive its preinitialized sockets from systemd, instead of creating them internally. For most services this requires (minimal) patching. However, since systemd actually provides inetd compatibility a service working with inetd will also work with systemd -- which is quite useful for services like sshd for example.

So much about the background of socket activation, let's now have a look how to patch a service to make it socket activatable. Let's start with a theoretic service foobard. (In a later blog post we'll focus on real-life example.)

Our little (theoretic) service includes code like the following for creating sockets (most services include code like this in one way or another):

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
A socket activatable service may use the following code instead:

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
systemd might pass you more than one socket (based on configuration, see below). In this example we are interested in one only. sd_listen_fds() returns how many file descriptors are passed. We simply compare that with 1, and fail if we got more or less. The file descriptors systemd passes to us are inherited one after the other beginning with fd #3. (SD_LISTEN_FDS_START is a macro defined to 3). Our code hence just takes possession of fd #3.

As you can see this code is actually much shorter than the original. This of course comes at the price that our little service with this change will no longer work in a non-socket-activation environment. With minimal changes we can adapt our example to work nicely both with and without socket activation:

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
With this simple change our service can now make use of socket activation but still works unmodified in classic environments. Now, let's see how we can enable this service in systemd. For this we have to write two systemd unit files: one describing the socket, the other describing the service. First, here's foobar.socket:

[Socket]
ListenStream=/run/foobar.sk

[Install]
WantedBy=sockets.target
And here's the matching service file foobar.service:

[Service]
ExecStart=/usr/bin/foobard
If we place these two files in /etc/systemd/system we can enable and start them:

# systemctl enable foobar.socket
# systemctl start foobar.socket
Now our little socket is listening, but our service not running yet. If we now connect to /run/foobar.sk the service will be automatically spawned, for on-demand service start-up. With a modification of foobar.service we can start our service already at startup, thus using socket activation only for parallelization purposes, not for on-demand auto-spawning anymore:

[Service]
ExecStart=/usr/bin/foobard

[Install]
WantedBy=multi-user.target
And now let's enable this too:

# systemctl enable foobar.service
# systemctl start foobar.service
Now our little daemon will be started at boot and on-demand, whatever comes first. It can be started fully in parallel with its clients, and when it dies it will be automatically restarted when it is used the next time.

A single .socket file can include multiple ListenXXX stanzas, which is useful for services that listen on more than one socket. In this case all configured sockets will be passed to the service in the exact order they are configured in the socket unit file. Also, you may configure various socket settings in the .socket files.

In real life it's a good idea to include description strings in these unit files, to keep things simple we'll leave this out of our example. Speaking of real-life: our next installment will cover an actual real-life example. We'll add socket activation to the CUPS printing server.

The sd_listen_fds() function call is defined in sd-daemon.h and sd-daemon.c. These two files are currently drop-in .c sources which projects should simply copy into their source tree. Eventually we plan to turn this into a proper shared library, however using the drop-in files allows you to compile your project in a way that is compatible with socket activation even without any compile time dependencies on systemd. sd-daemon.c is liberally licensed, should compile fine on the most exotic Unixes and the algorithms are trivial enough to be reimplemented with very little code if the license should nonetheless be a problem for your project. sd-daemon.c contains a couple of other API functions besides sd_listen_fds() that are useful when implementing socket activation in a project. For example, there's sd_is_socket() which can be used to distuingish and identify particular sockets when a service gets passed more than one.

Let me point out that the interfaces used here are in no way bound directly to systemd. They are generic enough to be implemented in other systems as well. We deliberately designed them as simple and minimal as possible to make it possible for others to adopt similar schemes.

Stay tuned for the next installment. As mentioned, it will cover a real-life example of turning an existing daemon into a socket-activatable one: the CUPS printing service. However, I hope this blog story might already be enough to get you started if you plan to convert an existing service into a socket activatable one. We invite everybody to convert upstream projects to this scheme. If you have any questions join us on #systemd on freenode.
