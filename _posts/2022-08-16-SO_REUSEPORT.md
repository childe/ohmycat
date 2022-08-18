---

date: 2022-08-16T00:11:44+0800
title: '[译]SO_REUSEPORT选项'
layout: post

---

原文 [The SO_REUSEPORT socket option [LWN.net]](https://lwn.net/Articles/542629/)

<!--more-->

One of the features merged in the 3.9 development cycle was TCP and UDP support for the SO_REUSEPORT socket option; that support was implemented in a series of patches by Tom Herbert. The new socket option allows multiple sockets on the same host to bind to the same port, and is intended to improve the performance of multithreaded network server applications running on top of multicore systems.

Linux 3.9 版本合并了一个 SO_REUSEPORT 的特性。可以在 TCP 和 UDP 的套接字上面配置 SO_REUSEPORT 这个选项；这项支持是 Tom Herbert 在一系列的补丁中实现的。这个新的套接字参数可以允许一台机器上面将多个套接字绑定在同一个端口上面，目的是为了提高多核机器上面的多线程网络服务应用的性能。

The basic concept of SO_REUSEPORT is simple enough. Multiple servers (processes or threads) can bind to the same port if they each set the option as follows:

SO_REUSEPORT 的基本概念非常简单。多进程（或者多线程）服务可以如下这样将多个套接字绑定在同一个端口上面。

    int sfd = socket(domain, socktype, 0);

    int optval = 1;
    setsockopt(sfd, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));

    bind(sfd, (struct sockaddr *) &addr, addrlen);

So long as the first server sets this option before binding its socket, then any number of other servers can also bind to the same port if they also set the option beforehand. The requirement that the first server must specify this option prevents port hijacking—the possibility that a rogue application binds to a port already used by an existing server in order to capture (some of) its incoming connections or datagrams. To prevent unwanted processes from hijacking a port that has already been bound by a server using SO_REUSEPORT, all of the servers that later bind to that port must have an effective user ID that matches the effective user ID used to perform the first bind on the socket.

使用这个特性有一个要求：第一个套接字必要要设置这个选项，以及接下来的套接字也要设置这个选项。这是为了阻止恶意程序绑定在同一个端口就能捕获进来的数据了。如果一个进程已经使用了 SO_REUSEPORT 的套接字，后续的进程必要使用同一个 effective user ID，才能绑定同一个端口，也是为了阻止恶意程序劫持。

SO_REUSEPORT can be used with both TCP and UDP sockets. With TCP sockets, it allows multiple listening sockets—normally each in a different thread—to be bound to the same port. Each thread can then accept incoming connections on the port by calling accept(). This presents an alternative to the traditional approaches used by multithreaded servers that accept incoming connections on a single socket.

SO_REUSEPORT 在 TCP 和 UDP 上都可以使用。在 TCP 上使用时，允许多个不同线程下的监听套接字绑定在同一个端口上。每一个线程都可以通过调用 accept 获取进来的数据。传统的多线程处理的方法是要在一个套接字上面接收进来的数据（译者注：然后再在多线程上处理这些数据）。

The first of the traditional approaches is to have a single listener thread that accepts all incoming connections and then passes these off to other threads for processing. The problem with this approach is that the listening thread can become a bottleneck in extreme cases. In early discussions on SO_REUSEPORT, Tom noted that he was dealing with applications that accepted 40,000 connections per second. Given that sort of number, it's unsurprising to learn that Tom works at Google.

传统的这个方法有一些问题。第一个问题，只有一个线程接收进来的数据流量，然后再传给其他线程们做处理。极端情况下，这个接收的线程可能会变成瓶颈。在早期的关于 SO_REUSEPORT 的讨论中，Tom 提到他的应用每秒会 accept 4万个连接。根据这个数字，我们不奇怪他在 Google 工作~

The second of the traditional approaches used by multithreaded servers operating on a single port is to have all of the threads (or processes) perform an accept() call on a single listening socket in a simple event loop of the form:

第二个问题，多线程在一个简单的死循环里面对同一个套接字上调用 accept，如下。

    while (1) {
        new_fd = accept(...);
        process_connection(new_fd);
    }

The problem with this technique, as Tom pointed out, is that when multiple threads are waiting in the accept() call, wake-ups are not fair, so that, under high load, incoming connections may be distributed across threads in a very unbalanced fashion. At Google, they have seen a factor-of-three difference between the thread accepting the most connections and the thread accepting the fewest connections; that sort of imbalance can lead to underutilization of CPU cores. By contrast, the SO_REUSEPORT implementation distributes connections evenly across all of the threads (or processes) that are blocked in accept() on the same port.

[如 Tom 指出的一样](https://lwn.net/Articles/542718/)，这种实现途径，在高负载下，进来的连接并不会平均分散到每个线程上。在 Google，我们可以看到最多的线程和最少的线程之间有三倍的差异，导致 CPU 不能充分复用。对比下来，使用 SO_REUSEPORT 的实现就很平均。

As with TCP, SO_REUSEPORT allows multiple UDP sockets to be bound to the same port. This facility could, for example, be useful in a DNS server operating over UDP. With SO_REUSEPORT, each thread could use recv() on its own socket to accept datagrams arriving on the port. The traditional approach is that all threads would compete to perform recv() calls on a single shared socket. As with the second of the traditional TCP scenarios described above, this can lead to unbalanced loads across the threads. By contrast, SO_REUSEPORT distributes datagrams evenly across all of the receiving threads.

和 TCP 一样，UDP 也可以使用 SO_REUSEPORT 这个选项，多个 UDP 套接字可以绑定在同一个端口。比如在 DNS 服务上，这个选项就很有用。每个线程可以在他自己的拼字上调用 recv 接收数据。传统的方法中，所有线程都要在同一个共享的套接字上竞争使用 recv 接收数据。就在上面的 TCP 的问题2中提到的一样，这可能会导致多线程的不平均分配。SO_REUSEPORT 就平均多了。

Tom noted that the traditional SO_REUSEADDR socket option already allows multiple UDP sockets to be bound to, and accept datagrams on, the same UDP port. However, by contrast with SO_REUSEPORT, SO_REUSEADDR does not prevent port hijacking and does not distribute datagrams evenly across the receiving threads.

[Tom 指出](https://lwn.net/Articles/542728/)，传统的 SO_REUSEADDR 选项已经允许多个 UDP 套接字绑定在同一端口。但是，他不能阻止端口劫持，而且数据不能在多个线程中平均分配。（译者注：TCP 中并不能使用 SO_REUSEADDR 将多个监听套接字绑定在同一端口，文档如下，我没有完全理解，需要测试以及翻阅原码进一步了解。[https://man7.org/linux/man-pages/man7/socket.7.html](https://man7.org/linux/man-pages/man7/socket.7.html)）

There are two other noteworthy points about Tom's patches. The first of these is a useful aspect of the implementation. Incoming connections and datagrams are distributed to the server sockets using a hash based on the 4-tuple of the connection—that is, the peer IP address and port plus the local IP address and port. This means, for example, that if a client uses the same socket to send a series of datagrams to the server port, then those datagrams will all be directed to the same receiving server (as long as it continues to exist). This eases the task of conducting stateful conversations between the client and server.

Tom 的补丁中有两个值得注意的点（译者注：一好一坏）。第一个是有用的一面。进来的 TCP 和 UDP 数据会根据4元组分配到同一个线程上（如果他们还存在的话）。这样更容易处理服务端与客户端之间的会话保持。

The other noteworthy point is that there is a defect in the current implementation of TCP SO_REUSEPORT. If the number of listening sockets bound to a port changes because new servers are started or existing servers terminate, it is possible that incoming connections can be dropped during the three-way handshake. The problem is that connection requests are tied to a specific listening socket when the initial SYN packet is received during the handshake. If the number of servers bound to the port changes, then the SO_REUSEPORT logic might not route the final ACK of the handshake to the correct listening socket. In this case, the client connection will be reset, and the server is left with an orphaned request structure. A solution to the problem is still being worked on, and may consist of implementing a connection request table that can be shared among multiple listening sockets.

第二点是一个不好的点。如果监听在同个端口的套接字数量变化的话，进来的连接可能会在三次握手中被丢掉。因为三次握手过程中，连接请求会绑定到特定的一个套接字上面（译者注：也可以理解成一个线程上面吧），如果套接字数量变动，最后一个 ACK 可能会路由到一个错误的套接字上面。这会导致客户端的连接被 Reset，同时服务端会留下一个孤儿请求结构。解决方案还在实现中，可能会在多个监听套接字中共享一个请求表。

The SO_REUSEPORT option is non-standard, but available in a similar form on a number of other UNIX systems (notably, the BSDs, where the idea originated). It seems to offer a useful alternative for squeezing the maximum performance out of network applications running on multicore systems, and thus is likely to be a welcome addition for some application developers.

SO_REUSEPORT 还不是标准，但已经在多个Unix 系统中可用了。看起来他提供了一个多核系统中运行高性能网络服务的选项，一些应用开发者可能会喜欢这个选项~
