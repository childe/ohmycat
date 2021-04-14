---

date: 2021-02-18T13:52:49+0800
title: Introducing the Journal

---

[Introducing the Journal](http://0pointer.net/blog/projects/the-journal.html)
[Introducing the Journal](https://docs.google.com/document/pub?id=1IC9yOXj7j6cdLLxWEBAGRL6wl97tFxgjLUEHIX3MSTs)

现在觉得 Systemd 比之前的管理方式好。但对于使用 Journal 管理日志还有些不明白，之前的日志方式（Rsyslog 或者直接日志打印到某到文件文件）不行？使用 Journal 的必要性在哪里？ 看到 Systemd 作者的这篇文件，翻译学习一下。


During the past weeks we have been working on a new feature for systemd, that we’d like to introduce to you today. At the same time as it helps us to substantially decrease the footprint of a minimal Linux system it brings a couple of new concepts and replaces a major component of a classic Unix system. Due that it probably deserves a longer introduction. So, grab yourself a good cup of swiss hot chocolate, lean back, read and enjoy.

在过去的几周里，我们一直在为 systemd 开发一个新特性，今天我们来给你介绍 一下它吧！它帮助我们大大减少了最小 Linux 系统的占用空间，同时，它还带来了一些新概念，并取代了经典 Unix 系统的一个主要组件。因为它可能值得一个长长的介绍。所以，给自己端上一杯咖啡，舒服的坐下，看下去，尽情享受吧。

Background: syslog

An important component of every Unix system for a long time has been the syslog daemon. During our long history multiple implementations have been used in the various Linux distributions for this job, but in essence they all implemented a very similar logic and used nearly identical file formats on disk.
长期以来，syslog 守护进程一直是每个 Unix 系统的一个重要组件。在我们漫长的历史中，各种 Linux 发行版都使用了多种实现来完成这项工作，但实际上它们都实现了非常相似的逻辑，并在磁盘上使用了几乎相同的文件格式。

The purpose of a syslog daemon is -- as the name suggests -- system logging. It receives relatively free-form log messages from applications and services and stores them on disk. Usually, the only meta data attached to these messages are a facility and a priority value, a timestamp, a process tag and a PID. These properties are passed in from the client, not verified and usually stored away as-is. Most of these fields are optional, and the precise syntax is varying wildly in the various implementations. An internet RFC eventually tried to formalize and improve the message format a bit, however the most important implementations (such as glibc’s syslog() call) make little use of these improvements.

syslog 守护进程的目的是 —— 顾名思义 —— 记录系统日志。它接收来自应用程序和服务的相对自由格式的日志消息，并将它们存储在磁盘上。通常，附加到这些消息的元数据仅有facility和优先级、时间戳、进程Tag 和 PID。这些属性是从客户端传入的，未经验证，通常按原样存储。这些字段中的大多数是可选的，并且在不同的实现中，精细的语法差别很大。终于有份 RFC 尝试对消息格式进行一些格式化和改进，但是最重要的实现（如 glibc 的 syslog 调用）几乎没有使用这些改进。

The fact that syslog enforces very little format of the log messages makes it both very versatile and powerful, but at the same time is also one of its biggest drawbacks. Since no structured format is defined, parsing and processing of log messages systematically is messy: the context information the generator of the messages knew is lost during the transformation into terse, lossy human language, and most log analyzers then try to parse the human language again in an attempt to reconstruct the context.

syslog 只强制规范很少的日志消息格式，这让它功能强大，但同时也是它最大的缺点之一。由于没有定义结构化格式，系统地解析和处理日志消息是混乱的：消息生成器所知道的上下文信息在转换为简洁、有损的人类语言的过程中丢失了，很多日志分析器又在随后尝试再次解析人类语言，试图重建上下文。??

Syslog has been around for ~30 years, due to its simplicity and ubiquitousness it is an invaluable tool for administrators. However, the number of limitations are substantial, and over time they have started to be serious problems:

Syslog 已经存在了约 30 年，由于它的简单性和普遍性，它对于管理员来说是一个非常宝贵的工具。然而，限制也是很明显的，随着时间的推移，它们已经开始成为严重的问题：

1. The message data is generally not authenticated, every local process can claim to be Apache under PID 4711, and syslog will believe that and store it on disk.

    消息数据通常没有经过身份验证，每个本地进程都可以声称自己是 Apache，PID 是 4711 ，syslog 会相信这一点并将其存储在磁盘上。

2. The data logged is very free-form. Automated log-analyzers need to parse human language strings to a) identify message types, and b) parse parameters from them. This results in regex horrors, and a steady need to play catch-up with upstream developers who might tweak the human language log strings in new versions of their software. Effectively, in a away, in order not to break user-applied regular expressions all log messages become ABI of the software generating them, which is usually not intended by the developer.

    记录的数据非常自由。自动日志分析器需要解析人类语言字符串，以便 a）识别消息类型，b）解析其中的参数。这导致了正则解析的可怕消耗，并且需要不断地赶上上游开发人员，他们可能会在新版本的软件中调整日志格式。实际上，为了不破坏用户应用的正则表达式，所有日志消息都成为生成它们的软件的 [ABI](https://en.wikipedia.org/wiki/Application_binary_interface)，这通常不是开发人员想要的。 ??

3. The timestamps generally do not carry timezone information, even though some newer specifications define support for it.

    时间戳通常不携带时区信息，即使一些较新的规范定义了对它的支持。

4. Syslog is only one of many log systems on local machines. Separate logs are kept for utmp/wtmp, lastlog, audit, kernel logs, firmware logs, and a multitude of application-specific log formats. This is not only unnecessarily complex, but also hides the relation between the log entries in the various subsystems.

    Syslog 只是本地计算机上许多日志系统中的一个。为 utmp/wtmp、lastlog、audit、内核日志、固件日志和多种特定于应用程序的日志格式保留单独的日志，这不仅是不必要的复杂，而且隐藏了各个子系统中日志条目之间的关系。 ??

5. Reading log files is simple but very inefficient. Many key log operations have a complexity of O(n). Indexing is generally not available.

    读取日志文件很简单，但效率很低。许多关键日志操作的复杂性为 O（n）。一般没有索引可用。

6. The syslog network protocol is very simple, but also very limited. Since it generally supports only a push transfer model, and does not employ store-and-forward, problems such as Thundering Herd or packet loss severely hamper its use.

    syslog 网络协议非常简单，但也非常有限。由于它通常只支持推送传输模型，并且不使用存储转发，诸如 Thundering Herd 问题或数据包丢失等问题严重阻碍了它的使用。

7. Log files are easily manipulable by attackers, providing easy ways to hide attack information from the administrator

    日志文件很容易被攻击者操作，而且很容易向管理员隐藏攻击信息。

8. Access control is non-existent. Unless manually scripted by the administrator a user either gets full access to the log files, or no access at all.

    没有权限控制。除非管理员手动编写脚本，否则用户要么可以完全访问日志文件，要么根本无法访问。

9. The meta data stored for log entries is limited, and lacking key bits of information, such as service name, audit session or monotonic timestamps.

    为日志条目存储的元数据是有限的，并且缺少关键信息位，例如服务名称、审计session或单调的时间戳。

10. Automatic rotation of log files is available, but less than ideal in most implementations: instead of watching disk usage continuously to enforce disk usage limits rotation is only attempted in fixed time intervals, thus leaving the door open to many DoS attacks.

    日志文件的自动轮转是可用的，但在大多数实现中并不理想：轮换只是在固定的时间间隔内尝试的，而不是不断地观察磁盘使用情况以强制执行磁盘使用限制，从而使许多 DoS 攻击的大门敞开。

11. Rate limiting is available in some implementations, however, generally does not take the disk usage or service assignment into account, which is highly advisable.

    速率限制在某些实现中是可用的，但是，通常不考虑磁盘使用或服务分配，而这又是非常有用的。

12. Compression in the log structure on disk is generally available but usually only as effect of rotation and has a negative effect on the already bad complexity behaviour of many key log operations.

    磁盘上日志结构中的压缩通常是可用的，但通常仅是和轮转一起工作。并且许多关键日志操作本身已经够复杂了，压缩更加雪上加霜。

13. Classic Syslog traditionally is not useful to handle early boot or late shutdown logging, even though recent improvements (for example in systemd) made this work.

    传统上，经典的 Syslog 对于处理早期启动或后期关机日志记录是没有用的，尽管最近的改进（例如 systemd）使这一点得以实现。

14. Binary data cannot be logged, which in some cases is essential (Examples: ATA SMART blobs or SCSI sense data, firmware dumps)

    无法记录二进制数据，这在某些情况下是必需的（例如：ATA 智能 Blob 或 SCSI 检测数据、固件转储）


Many of these issues have become very visible in the recent past. For example, intrusion involved in log file manipulation which can usually only detected by chance. In addition, due to the limitations of syslog, at this point in time users frequently have to rely on closed source components to make sense of the gathered logging data, and make access to it efficient.


Logging is a crucial part of service management. On Unix, most running services connect to syslog to write log messages. In systemd, we built logging into the very core of service management: since Fedora 16 all services started are automatically connected to syslog with their standard output and error output. Regardless whether a service is started at early boot or during normal operation, its output ends up in the system logs. Logging is hence something so central, that it requires configuration to avoid it, and is turned from opt-in to opt-out. The net effect is a much more transparent, debuggable and auditable system. Transparency is no longer just an option for the knowledgeable, but the default.


During the development of systemd the limitations of syslog became more and more apparent to us. For example: one very important feature we want to add to ease the administrator’s work is showing the last 10 lines (or so) of log output of a service next to the general service information shown by “systemctl status foo.service”. Implementing this correctly for classic syslog is prohibitively inefficient, unreliable and insecure: a linear search through all log files (which might involve decompressing them on-the-fly) is required, and the data stored might be manipulated, and cannot easily (and without races) be mapped to the systemd service name and runtime.


To reduce all this to a few words: traditional syslog, after its long history of ~30 years has grown into a very powerful tool which suffers by a number of severe limitations.


Now, what can we do to improve the situation?

The Journal
You probably already guessed it from the explanations in the section above: What we have been working on is a new solution for the logging problem, fixing the issues pointed out above and adding a couple of new features on top: the Journal.


Of course, when designing a new core component of the OS like this, a few design goals should be very clear:

Simplicity: little code with few dependencies and minimal waste through abstraction.
Zero Maintenance: logging is crucial functionality to debug and monitor systems, as such it should not be a problem source of its own, and work as well as it can even in dire circumstances. For example, that means the system needs to react gracefully to problems such as limited disk space or /var not being available, and avoid triggering disk space problems on its own (e.g. by implementing journal file rotation right in the daemon at the time a journal file is extended).
Robustness: data files generated by the journal should be directly accessible to administrators and be useful when copied to different hosts with tools like “scp” or “rsync”. Incomplete copies should be processed gracefully. Journal file browsing clients should work without the journal daemon being around.
Portable: journal files should be usable across the full range of Linux systems, regardless which CPU or endianess is used. Journal files generated on an embedded ARM system should be viewable on an x86 desktop, as if it had been generated locally.
Performance: journal operations for appending and browsing should be fast in terms of complexity. O(log n) or better is highly advisable, in order to provide for organization-wide log monitoring with good performance
Integration: the journal should be closely integrated with the rest of the system, so that logging is so basic for a service, that it would need to opt-out of it in order to avoid it. Logging is a core responsibility for a service manager, and it should be integrated with it reflecting that.
Minimal Footprint: journal data files should be small in disk size, especially in the light that the amount of data generated might be substantially bigger than on classic syslog.
General Purpose Event Storage: the journal should be useful to store any kind of journal entry, regardless of its format, its meta data or size.
Unification: the numerous different logging technologies should be unified so that all loggable events end up in the same data store, so that global context of the journal entries is stored and available later. e.g. a firmware entry is often followed by a kernel entry, and ultimately a userspace entry. It is key that the relation between the three is not lost when stored on disk.
Base for Higher Level Tools: the journal should provide a generally useful API which can be used by health monitors, recovery tools, crash report generators and other higher level tools to access the logged journal data.
Scalability: the same way as Linux scales from embedded machines to super computers and clusters, the journal should scale, too. Logging is key when developing embedded devices, and also essential at the other end of the spectrum, for maintaining clusters. The journal needs to focus on generalizing the common use patterns while catering for the specific differences, and staying minimal in footprint.
Universality: as a basic building block of the OS the journal should be universal enough and extensible to cater for application-specific needs. The format needs to be extensible, and APIs need to be available.
Clustering & Network: Today computers seldom work in isolation. It is crucial that logging caters for that and journal files and utilities are from the ground on developed to support big multi-host installations.
Security: Journal files should be authenticated to make undetected manipulation impossible.

So much about the design goals, here’s an high-level technical overview of what we came up with to implement all this and how the new system works:


Inspired by udev events, journal entries resemble environment blocks. A number of key/value fields, separated by line breaks, with uppercase variable names. In comparison to udev device events and real environment blocks there’s one major difference: while the focus is definitely on ASCII formatted strings, binary blobs as values are also supported -- something which may be used to attach binary meta data such as ATA SMART health data, SCSI sense data, coredumps or firmware dumps. The code generating a journal entry can attach as many fields to an entry as he likes, which can be well-known ones, or service/subsystem/driver specific ones.


Applications and services may generate entries in the journal by passing entry fields to systemd’s journald service. This service will augment the entry with a number of meta fields. The values of these trusted fields are determined by the journal service itself and cannot be faked by the client side. In case hardware and kernel devices are involved, the journal service will augment the log entry with the currently available device information from the udev database, which stores all known device names and symlinks, and other associated device data in the journal entry.


The fields the journal daemon adds are prefixed with an underscore (“_”) as an indication that this field is trusted and not supplied by a potentially rogue client. Applications themselves cannot pass field names starting with an underscore. Here’s an example how an entry sent from a client after augmentation might look:


_SERVICE=systemd-logind.service

MESSAGE=User harald logged in

MESSAGE_ID=422bc3d271414bc8bc9570f222f24a9

_EXE=/lib/systemd/systemd-logind

_COMM=systemd-logind

_CMDLINE=/lib/systemd/systemd-logind

_PID=4711

_UID=0

_GID=0

_SYSTEMD_CGROUP=/system/systemd-logind.service

_CGROUPS=cpu:/system/systemd-logind.service

PRIORITY=6

_BOOT_ID=422bc3d271414bc8bc95870f222f24a9

_MACHINE_ID=c686f3b205dd48e0b43ceb6eda479721

_HOSTNAME=waldi

LOGIN_USER=500


This example entry is generated by systemd's logind daemon when a user “harald” logs in. As you can see the automatically added data is quite comprehensive and includes a number of important process execution parameters. For a longer explanation on the various well-known fields defined see:


https://docs.google.com/document/pub?id=1MqQpm-ey8yVDPY8QVL155pvivay3Ut09dKxeVyNCrp8


The native journal file format is inspired by classic log files as well as git repositories. It is designed in a way that log data is only attached at the end (in order to ensure robustness and atomicity with mmap()-based access), with some meta data changes in the header to reference the new additions. The fields, an entry consists off, are stored as individual objects in the journal file, which are then referenced by all entries, which need them. This saves substantial disk space since journal entries are usually highly repetitive (think: every local message will include the same _HOSTNAME= and _MACHINE_ID= field). Data fields are compressed in order to save disk space. The net effect is that even though substantially more meta data is logged by the journal than by classic syslog the disk footprint does not immediately reflect that.


The on disk format uses exclusively 64bit LE (little endian) offsets, in order to simplify things and ensure we can store blob data of substantial sizes. No synchronization between log browser tools and journald is necessary, clients which want to browse the journal files can simply mmap() the journal files and use file change notifications for information about updates.


A client library to allow access to the journal files is available, which enables indexed access to entries via any field, and with random access via monotonic or wallclock timestamps. The client library automatically coalesces multiple journal files so that they appear as a single unified stream of journal entries. This is used to hide whether journal files are archived (i.e. “rotated”) or belong to multiple users. The transparent merging of journal files in the browsing interface is fully dynamic: as new journal files are created or old ones deleted the  browser view is automatically updated. In fact, journal browsing is intended to be live, to enable real-time monitoring of journal sources.


http://cgit.freedesktop.org/systemd/tree/src/journal/sd-journal.h?h=journal


Messages from unprivileged login users are split off into individual journal files, one per user. Using POSIX ACLs for controlling read access, it is ensured that users can access their own journal files. The journal entries generated by system services are by default not accessible by normal users, unless they are a member of a special Unix group. Note that the separation of files happens to accommodate for proper access control, but the global contexts of log entries is not lost, due to the client side coalescing of journal files, and by enforcing a single needle eye all messages are passed through to guarantee global ordering by automatically assigned sequence numbers. In effect this means that access control is guaranteed without compromise regarding the context of user journal entries.


One of the core ideas of the journal is to unify the various logging technologies we currently have. As such it should be useful as replacement for wtmp, early boot loggers and even the audit logging backend. Data can be generated from a variety of sources: kernel messages generated with printk(), userspace messages generated with syslog(3), userspace entries using the native API, coredumps via /proc/proc/sys/kernel/core_pattern and more. Later on we hope to hook up firmware messages (UEFI logs) and extend kernel based logging to support in-kernel structured logging. Since all fields are implicitly indexed in the journal data structure it is a relatively cheap operation to extract user data like from wtmp from the journal. Early-boot and runtime logging are unified. As long as /var is not available, all journal entries are automatically stored on /run, and then flushed to /var as soon as it is available. This means that ultimately all messages generated by the system, regardless whether by the firmware during POST, during kernel initialisation, during early boot or at runtime, end up in the same indexed journal files.


In order to make entries recognisable to client utilities, journal entries may optionally carry a 128bit identifier in MESSAGE_ID=, set by the service generating the message. This ID shall be a randomly generated ID by the developer at development time. For example, there’s one ID for “User logged out” and another one for “User logged in”. All entries for these events will carry the respective 128bit ID thus making them easily recognisable, and implicitly indexed by them. It is a good idea to use IDs for this which are compatible with RFC4122 UUID of type 4, however this is not strictly required and not enforced. This is designed to be compatible with other logging systems which use UUIDs to identify message types, such as the UEFI firmware logs. Consider these 128bit IDs global error codes, that due to their randomized nature need no central standardization entity that assigns numeric IDs to specific message types. Assigning message IDs is entirely optional, and we expect that only a minority of journal entries will carry them, i.e. only those which need to be recognisable by userspace. If a developer needs a new 128bit ID to assign to a new message type he introduced, all he needs to do is run “cat /proc/sys/kernel/random/uuid” which returns a new UUID on each invocation. The 128bit IDs can also be used to implement localized message UIs, which look up messages in a language catalog and present the translated message to the user, entirely in the UI tool.


All entries are implicitly timestamped with the realtime (i.e. wallclock) and monotonic clock. To make the monotonic timestamps useful all messages also carry the boot ID of the running Linux kernel (i.e. /proc/sys/kernel/random/boot_id). The accuracy is 1usec, and the wallclock is stored in usec since the epoch UTC in order to avoid the timezone problems syslog is suffering by.


Journal files can be rotated, deleted, copied to other machines, merged, or otherwise manipulated. In order to ensure that applications, synchronization tools and network services can reliably identify entries all journal entries can be identified by a cursor string. Such a string identifies a specific message and stays stable even when an entry is lost or not available, and then can be used to locate the next closest entry.


journald automatically rotates journal files if they grow above certain limits. This is built right into the disk space allocation logic, in order to avoid vulnerability windows due to purely time-based rotation. Rotation not only takes a maximum disk usage limit into account, but also monitors general disk usage levels in order to ensure that a certain amount of space is always kept free on disk.


Entries sent by clients are subject to implicit rate limiting, to avoid that rogue clients can flush relevant data out of the journal, by flooding it with is own data. The rate is adjusted by the amount of available disk space, so that higher message rates are allowed when disk space is generous and lower rates enforced when disk space is scarce


In the initial version journald’s network support will be very simple: to share journal files across the network, simply copy them to a central host with a tool like scp, rsync or via NFS. The journal browser client tool will then transparently merge these files, interleaving them as necessary. In a later version we plan to extend the journal minimally to support live remote logging, in both PUSH and PULL modes always using a local journal as buffer for a store-and-forward logic. Regardless which mode of transportation is used, the underlying journal format is designed to be scalable to large numbers of hosts and all entries are identified by both the machine ID and the host name. The goal is to implement an efficient journal monitoring tool that can browse journals from a multitude of hosts transparently and live, while leaving to the administrator the choice of transport so that he can adjust it to his own needs, i.e. whether live functionality is more important than avoiding the thundering herd, and other considerations.


The Internet is a dangerous place. Break-ins on high-profile web sites have become very common. After a successful break-in the attacker usually attempts to hide his traces by editing the log files. Such manipulations are hard to detect with classic syslog: since the files are plain text files no cryptographic authentication is done, and changes are not tracked. Inspired by git, in the journal all entries are cryptographically hashed along with the hash of the previous entry in the file. This results in a chain of entries, where each entry authenticates all previous ones. If the top-most hash is regularly saved to a secure write-once location, the full chain is authenticated by it. Manipulations by the attacker can hence easily be detected.


As mentioned logging is an essential part of service management. That not only refers to the fact that the service’s own log output needs to be channeled to the journal, but also that journal entries are generated for external service events, for example, each time when a service starts, fails, stops or crashes.


The journal daemon journald replaces the two mini daemons systemd already ships that are related to logging (systemd-kmsg-syslogd and systemd-stdout-syslog-bridge) right from the beginning. In the long run we hope to replace the traditional syslog daemons on many installations, but not conflict with them. The net footprint of a Linux system should shrink, due the reduction of services run (1 in place of 3), and because journald is actually much less code than a full-blown syslog daemon.

Current Status
At this point in time, the core functionality and all non-trivial algorithms are implemented and available in the “journal” branch in systemd git. The code however is not complete, and missing a number of features pointed out above.


This blog story we put together to clear up a few misconceptions of our plans, choices and reasons that have been uttered in the community.


It is our intention to put an initial implementation of this into Fedora 17, but hook up only very few selected components directly with it in the first iteration. rsyslog will run side-by-side with it, and the user should notice very little of journald, except that “systemctl status” will start to show recent log output for all services. Unless of course he plays around with our new client tools, like “journalctl” which may be used to search the (indexed) journal.

Frequently Asked Questions
We have been discussing the design above with a number of people from various backgrounds in the past weeks, collecting ideas, suggestions and criticism. A couple of points were raised very vocally, and repeatedly. Here’s a list of them with our answers:


The journal is cool, but systemd is an abomination, can I use the journald without systemd?


No, you can’t. Logging is a core part of service management. The journal is tightly integrated with the rest of systemd to ensure that everything in the system can be monitored, introspected and debugged. The generated journal entries are queried from various components in systemd. In effect systemd and journald are so tightly coupled that separating them would make little sense. That said, it’s Free Software, so you can do with the code whatever suits you. Finally, you are actually wrong in believing that systemd was an abomination.


Does running the journal break rsyslog/syslog-ng?


No, it doesn’t. You may run rsyslog or syslog-ng side-by-side with journald, and syslog messages will end up in both rsyslog/syslog-ng and the journal. However, the journal will store a lot of meta data along with the syslog messages that plain syslog won’t.


My application needs traditional text log files on disk, can I configure journald to generate those?


No, you can’t. If you need this, just run the journal side-by-side with a traditional syslog implementation like rsyslog which can generate this file for you.


Why doesn’t the journal generate traditional log files?


Well, for starters, traditional log files are not indexed, and many key operations very slow with a complexity of O(n). The native journal file format allows O(log(n)) complexity or better for all important operations. For more reasons, refer to the sections above.


Can I connect a remote RFC compliant syslog protocol message generator to the journal?


At this point in time, no, you can’t. And it is unlikely that journald will ever support this out-of-the-box. However, it shouldn’t be too difficult to write a converter or gateway tool to make this work.


I am using systemd on an embedded system and am not interested in persistent logging, can I opt out of the journal?


No you can’t really. However, what you can do is tell systemd that you don’t want persistent logging, by removing (or not creating in the first place) the /var/log/journal directory, in which case journald will log only to /run/log/journal (which it does in any case during early boot). /run is volatile and lost on reboots, in contrast to /var. On top of that you can configure the maximum disk space the journal may consume to a low value.


UUIDs are broken, everybody knows that. Why are you using UUIDs to identify messages?


Well, it is true that the UUID specification is baroque and needlessly complex. Due to that we recommend sticking to UUID Type 4 and ignoring the rest of RFC 4122. UUIDs actually have a long successful history on Linux. For example, all distributions by default mount file systems exclusively by their file system UUIDs.


But meh, UUIDs never worked! i.e. MAC addresses are duplicated and all my USB devices have the same one! Why do you insist on using them?


Well, we are using them all the time, in file systems for example, as already mentioned above, and they do their job very nicely there and always have. Hardware carries serial numbers that many vendors initialize to 1-2-3-4-5 or similar, but that has very little to do with the general idea of UUIDs. Device serial numbers aren’t UUIDs. Don’t mix them up!


In addition, we are not insisting on them. As mentioned above they are fully optional, and should only be assigned to those messages that shall be recognisable later on.


But if I introduce a UUID for a message type in my code and somebody uses this code as a template for some new work then the journal breaks.


No, this is wrong. Why? Simply because the same 128bit ID should be assigned to the same error condition/entry type, regardless from which source it comes. e.g. the 128bit ID that is used to identify “Sector bad on block device” should be the same regardless which device generates the message, or which driver. If userspace software needs to distinguish journal entries from different services, drivers or devices, it should use additional journal matches on the service/device/driver fields.


Or in other words, what you are pointing out is actually a good thing. We specifically encourage people to reuse message IDs, which describe the same thing, in their software, instead of inventing new ones.


But still, the printf()/printk() format strings of the messages would be much better for identifying message types!


That’s actually not really the case. Ultimately format strings are just human language templates. And human language is fragile for message type identification: every corrected spelling mistake would alter the message type, and cause journal clients to misidentify messages. Every time a journal message is extended, reworded, rewritten an ABI break takes places. Or to turn this around: by using message format strings as identifiers every message of the kernel becomes ABI, and turning human language into ABI is fatal. Effectively, little is gained over the classic regex log matching at a very steep price of making all log messages ABI. OTOH messages IDs can stay unaltered when their human languages strings are altered, thus neatly separating ABI from the human language.


You guys really don’t get it! You should totally use the source code file name and location as identifier for messages!


This is not really feasible, since it would turn the source code location into ABI: every time the developer adds a new line of code at the top of his .c file all message IDs would change. This would be major problem.


Who would organize and manage the UUID namespace and generate UUIDs? Seriously, we don’t need more bureaucracy people will only ignore!


The nice thing about 128bit random IDs is that their namespace does not need to be managed. Everybody can just pull a random UUID out of /proc/sys/kernel/random/uuid, and it is his. Developers can generate as many UUIDs as they need without having to ask any central entity. UUIDs allow us to have a common namespace without any bureaucracy.


But come on, seriously! UUIDS? From which planet are you!? Everybody knows that an agency like LANANA would be ideal for assigning globally unique message type IDs to applications!


Linux is not an island. It’s highly desirable that message IDs used by other infrastructure seamlessly integrates with what we do in the Journal. Hence we pick something that makes sense and is already used elsewhere. Also, UUIDs are essentially little more than a global namespace for unique identifiers that needs no central organization. Why have the bureaucracy of a central understaffed registrar if you don’t have to?


Nah, you should use reverse domain name notation to identify message types, like Java!


Comparing strings is substantially more complex that comparing fixed size IDs. Also, let’s face it, this wouldn’t solve the namespacing issue anyway, since 90% of all message types would probably be in the same namespaces: org.freedesktop resp. org.kernel.


But ASN.1 OIDs would make great message type identifiers!


Dude, seriously?


Now I have an even better idea, what about using URLs as message type IDs?


Well, they offer little advantage over reverse domain name notation, don’t they?


But guys, really. If you always generate a UUID on each entry that is generated my entire entropy pool will always be drained!


Read the blog story again, as you apparently didn’t read it very carefully. The 128bit message type IDs are assigned by the developer when he needs one to identify a specific message type at the time of developing, not at runtime. Most projects will probably never generate more than 30 of these during their entire development time, and the entropy for that should be trivially available on developer machines, even 10 years old.


You crazy userspace kids, first you force me to use have 20 cpu cgroups on my system, and now you force me to have stinky UUIDs on my system?


Well, ignoring the fact that we don’t force you to have 20 cpu cgroups, and that you are almost definitely already using UUIDs all the time because your file systems are found via UUIDs at boot time -- consider them an implementation detail, and if you don’t like them, then you don’t have to attach them to your messages. That comes at the price that the messages aren’t recognisable though, except via regex matching horrors. But hey, maybe that’s what you want? And anyway, we don’t force anybody to do anything anyway.


So you are splitting up journal entries based on the user ID of the user sending them. But how do you make sure that the user doesn’t lie about who he is?


Thankfully, the Linux kernel supports SCM_CREDENTIALS, which provides us with information about the sender of a message he cannot fake.


Will the journal file format be standardized? Where can I find an explanation of the on-disk data structures?


At this point we have no intention to standardize the format and we take the liberty to alter it as we see fit. We might document the on-disk format eventually, but at this point we don’t want any other software to read, write or manipulate our journal files directly. The access is granted by a shared library and a command line tool. (But then again, it’s Free Software, so you can always read the source code!)


Why do you guys reinvent the wheel, again? Why not just add what you need to existing syslog? If you just clean up your log formatting, syslog should be fine!


Well, sometimes improving an existing solution is the way to go, but when the changes necessary are too major a reinvention is a good thing, if it is done for the right reasons, and provides good compatibility with previous solutions. We believe we are doing it for the right reasons, and we try hard to provide greatest possible compatibility.


And no, just fixing the log formatting won’t get you much. Not even the most basic requirements like binary blobs or sensible structured logging. Let alone stuff like indexing or proper access control.


Does the journal obsolete syslog entirely?


No, first of all, the syslog API syslog(3) is supported as first-class interface to write log messages, and continues to be the primary API for all simple text logging. However, as soon as meta data (especially binary meta data) shall be attached to an entry the native journal API should be used instead.


Secondly, the journal is an entirely new thing. OTOH, Syslog is an industry standard (though a pretty weakly defined one, given that its log format is barely agreed on), and a widely accepted one, which is implemented in numerous operating systems, applications and devices. As such, syslog will continue to be important and will be needed on many many installations. The journal daemon does not speak the RFC syslog protocol, and it is unlikely it ever will. Wherever protocol compatibility with syslog is required, a classic syslog implementation needs to be used. To ensure this works nicely, we implemented the journal so that it can cooperate cleanly with a local syslog daemon and messages are forwarded as needed so that syslog continues to work exactly as it did without journald in the mix.

And this is where You come in!
Before putting together this design we spoke to a number of high profile log users, including users with more than a hundred thousand active hosts. We also spoke to a number of engineers who worked in the area or might become major users of the journal. We were particularly interested in usage patterns, and scalability issues. However, of course every installation has its own needs and requirements. Thus we’d like to ask you to contact us in case there’s some important functionality you’d need for your specific setup that you currently don’t find covered in the design pointed out above. The design above focuses exclusively on the lower layers of the logging stack. Specific UIs are out of focus for us, for now, thus we’d like to ask you to leave comments about them for a later time. Also, it’s not Christmas yet, so we are unlikely to fulfil all wishes (please don’t be disappointed!), but it matters to us to learn about them, and we can promise that we’ll at least consider them! Thank you very much in advance!

