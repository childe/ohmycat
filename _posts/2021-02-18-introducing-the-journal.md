---

date: 2021-02-18T13:52:49+0800
title: Introducing the Journal

---

[Introducing the Journal](http://0pointer.net/blog/projects/the-journal.html)
[Introducing the Journal](https://docs.google.com/document/pub?id=1IC9yOXj7j6cdLLxWEBAGRL6wl97tFxgjLUEHIX3MSTs)

现在觉得 Systemd 比之前的管理方式好。但对于使用 Journal 管理日志还有些不明白，之前的日志方式（Rsyslog 或者直接日志打印到某到文件文件）不行？使用 Journal 的必要性在哪里？ 看到 Systemd 作者的这篇文件，翻译学习一下。

<!--more-->

During the past weeks we have been working on a new feature for systemd, that we’d like to introduce to you today. At the same time as it helps us to substantially decrease the footprint of a minimal Linux system it brings a couple of new concepts and replaces a major component of a classic Unix system. Due that it probably deserves a longer introduction. So, grab yourself a good cup of swiss hot chocolate, lean back, read and enjoy.

在过去的几周里，我们一直在为 systemd 开发一个新特性，今天我们来给你介绍 一下它吧！它帮助我们大大减少了最小 Linux 系统的占用空间，同时，它还带来了一些新概念，并取代了经典 Unix 系统的一个主要组件。因为它可能值得一个长长的介绍。所以，给自己端上一杯咖啡，舒服的坐下，看下去，尽情享受吧。

## Background: syslog

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

这些问题中在最近已经变得非常明显。例如，涉及日志文件的入侵通常只能被偶然发现。此外，由于 syslog 的局限性，此时用户常常不得不依赖于封闭源代码组件来理解收集到的日志数据，以便更高效的访问它。


Logging is a crucial part of service management. On Unix, most running services connect to syslog to write log messages. In systemd, we built logging into the very core of service management: since Fedora 16 all services started are automatically connected to syslog with their standard output and error output. Regardless whether a service is started at early boot or during normal operation, its output ends up in the system logs. Logging is hence something so central, that it requires configuration to avoid it, and is turned from opt-in to opt-out. The net effect is a much more transparent, debuggable and auditable system. Transparency is no longer just an option for the knowledgeable, but the default.

日志是服务管理的关键部分。在 Unix 上，大多数正在运行的服务连接到 syslog 以写入日志消息。在 systemd 中，我们将日志构建到服务管理的核心：从 fedora16 开始，所有启动的服务都自动连接到 syslog，并带有它们的标准输出和错误输出。无论服务是在早期引导时启动还是在正常操作期间启动，其输出最终都会出现在系统日志中。因此，日志记录非常重要，它需要配置来避免它，并且从 opt-in 变为 opt-out。网络效应是一个更加透明、可调试和可审计的系统。透明度不再只是知识渊博者的选择，而是默认的选择。 ??

[opt-in/out 是啥](https://termly.io/resources/articles/opt-in-vs-opt-out/)


During the development of systemd the limitations of syslog became more and more apparent to us. For example: one very important feature we want to add to ease the administrator’s work is showing the last 10 lines (or so) of log output of a service next to the general service information shown by “systemctl status foo.service”. Implementing this correctly for classic syslog is prohibitively inefficient, unreliable and insecure: a linear search through all log files (which might involve decompressing them on-the-fly) is required, and the data stored might be manipulated, and cannot easily (and without races) be mapped to the systemd service name and runtime.

在 systemd 的发展过程中，syslog 的局限性越来越明显。例如：为了方便管理员的工作，我们想添加一个非常重要的特性，即在 “systemctl status foo.service” 所示的常规服务信息旁边显示服务的最后 10 行（大约 10 行）日志输出。 对于经典 syslog，正确地实现这一点是非常低效、不可靠和不安全的：需要对所有日志文件进行线性搜索（还可能涉及同时进行的解压缩），并且存储的数据可能会被操纵，并且很难映射到 systemd 服务名称和运行时。


To reduce all this to a few words: traditional syslog, after its long history of ~30 years has grown into a very powerful tool which suffers by a number of severe limitations.

简而言之，传统的 syslog 在经历了 30 年的漫长历史之后，已经发展成为一个非常强大的工具，却受到了许多严重的限制。


Now, what can we do to improve the situation?

那我们要怎么办呢？

## The Journal

You probably already guessed it from the explanations in the section above: What we have been working on is a new solution for the logging problem, fixing the issues pointed out above and adding a couple of new features on top: the Journal.

你可能已经从上面一节的解释中猜到了：我们正在研究的是日志问题的新解决方案，解决了上面指出的问题，并在上面添加了几个新特性：Journal。


Of course, when designing a new core component of the OS like this, a few design goals should be very clear:

当然，在这样设计操作系统的新核心组件时，有几个设计目标应该非常明确：


1. Simplicity: little code with few dependencies and minimal waste through abstraction.

    简单性：代码少，依赖关系少，通过抽象减少了浪费。

2. Zero Maintenance: logging is crucial functionality to debug and monitor systems, as such it should not be a problem source of its own, and work as well as it can even in dire circumstances. For example, that means the system needs to react gracefully to problems such as limited disk space or /var not being available, and avoid triggering disk space problems on its own (e.g. by implementing journal file rotation right in the daemon at the time a journal file is extended).

    零维护：日志记录是调试和监视系统的关键功能，因此它本身不应该是问题源，即使在恶劣的环境下也能正常工作。例如，这意味着系统需要对诸如磁盘空间有限或 /var 不可用之类的问题做出妥善处理，并避免自己触发磁盘空间问题（例如，在守护进程本身就实现日志文件轮转）。

3. Robustness: data files generated by the journal should be directly accessible to administrators and be useful when copied to different hosts with tools like “scp” or “rsync”. Incomplete copies should be processed gracefully. Journal file browsing clients should work without the journal daemon being around.

    健壮性：日志生成的数据文件应该可以直接供管理员访问，这在使用 “scp” 或 “rsync” 等工具复制到不同的主机时非常有用。复制不完整时应妥善处理。日志浏览客户端应该能在没有日志守护进程的情况下工作。

4. Portable: journal files should be usable across the full range of Linux systems, regardless which CPU or endianess is used. Journal files generated on an embedded ARM system should be viewable on an x86 desktop, as if it had been generated locally.

    可移植性：日志文件应该可以在所有 Linux 系统中使用，无论使用哪个 CPU 或编码。在嵌入式 ARM 系统上生成的日志文件应该可以在 x86 桌面上查看，就好像它是本地生成的一样。

5. Performance: journal operations for appending and browsing should be fast in terms of complexity. O(log n) or better is highly advisable, in order to provide for organization-wide log monitoring with good performance

    性能：添加和浏览的日志在复杂性方面应该是快速的。最好是 O（logn）或更高，以便在日志监控时提供具有良好性能。

6. Integration: the journal should be closely integrated with the rest of the system, so that logging is so basic for a service, that it would need to opt-out of it in order to avoid it. Logging is a core responsibility for a service manager, and it should be integrated with it reflecting that.

    集成：日志应该与系统的其余部分紧密集成，日志记录对于服务来说是非常基本的，因此需要 opt-out 来禁用它。日志记录是服务管理器的核心职责，应该与之集成。

7. Minimal Footprint: journal data files should be small in disk size, especially in the light that the amount of data generated might be substantially bigger than on classic syslog.

    最小占用空间：日志数据文件的磁盘大小应该很小，特别是考虑到生成的数据量可能比经典 syslog 上的数据量大得多。

8. General Purpose Event Storage: the journal should be useful to store any kind of journal entry, regardless of its format, its meta data or size.

    通用事件存储：journal 应该可以帮助存储任何类型的日志，无论其格式、元数据或大小如何。

9. Unification: the numerous different logging technologies should be unified so that all loggable events end up in the same data store, so that global context of the journal entries is stored and available later. e.g. a firmware entry is often followed by a kernel entry, and ultimately a userspace entry. It is key that the relation between the three is not lost when stored on disk.

    统一：海量不同的日志记录技术应该是统一的，以便所有可记录的事件最终都在同一个数据存储中，这样日志数据的全局上下文被存储下来并在以后可用。硬件记录后面通常跟一个内核记录，最后是一个用户空间记录。存储在磁盘上时，三者之间的关系不丢失非常关键。

10. Base for Higher Level Tools: the journal should provide a generally useful API which can be used by health monitors, recovery tools, crash report generators and other higher level tools to access the logged journal data.

    高级工具的基础：日志应该提供一个通常有用的 API，可以被健康监视器、恢复工具、崩溃报告生成器和其他高级工具用来访问日志数据。

11. Scalability: the same way as Linux scales from embedded machines to super computers and clusters, the journal should scale, too. Logging is key when developing embedded devices, and also essential at the other end of the spectrum, for maintaining clusters. The journal needs to focus on generalizing the common use patterns while catering for the specific differences, and staying minimal in footprint.

    可伸缩性：就像 Linux 从嵌入式计算机扩展到超级计算机和集群一样，journal 也应该扩展。在开发嵌入式设备时，日志记录是关键，在另一端，集群的维护中，日志记录也是必不可少的。journal 需要概括常见的使用模式，同时照顾到具体的差异，并占用最小的空间。

12. Universality: as a basic building block of the OS the journal should be universal enough and extensible to cater for application-specific needs. The format needs to be extensible, and APIs need to be available.

    通用性：作为操作系统的基本构建块，日志应该具有足够的通用性和可扩展性，以满足特定应用程序的需要。格式需要是可扩展的，并且有 api 可用。

13. Clustering & Network: Today computers seldom work in isolation. It is crucial that logging caters for that and journal files and utilities are from the ground on developed to support big multi-host installations.

    集群和网络：今天的计算机很少单独工作。 It is crucial that logging caters for that and journal files and utilities are from the ground on developed to support big multi-host installations.

14. Security: Journal files should be authenticated to make undetected manipulation impossible.

    安全性：日志文件应该经过身份验证，杜绝未认证的操作。


So much about the design goals, here’s an high-level technical overview of what we came up with to implement all this and how the new system works:

设计目标这么多了，这里就从一个高层次的技术视角来看一下，我们怎么实现的所有这些，以及新系统是怎么工作的：


Inspired by udev events, journal entries resemble environment blocks. A number of key/value fields, separated by line breaks, with uppercase variable names. In comparison to udev device events and real environment blocks there’s one major difference: while the focus is definitely on ASCII formatted strings, binary blobs as values are also supported -- something which may be used to attach binary meta data such as ATA SMART health data, SCSI sense data, coredumps or firmware dumps. The code generating a journal entry can attach as many fields to an entry as he likes, which can be well-known ones, or service/subsystem/driver specific ones.

受 udev event 的启示，日记条目类似于 environment blocks。多个键/值段，以换行符分隔，变量名为大写。与 udev 设备事件和真实 environment blocks 相比，有一个主要的区别：虽然重点明确放在 ASCII 格式的字符串上，但也支持二进制 blob 作为值 — 可以用来附加二进制元数据，如 ATA SMART 健康数据、SCSI 传感数据、coredumps 或固件dumps。生成日志条目的代码可以将任意多个字段附加到条目上，这些字段可以是众所周知的字段，也可以是服务 / 子系统 / 驱动程序特有的字段。


Applications and services may generate entries in the journal by passing entry fields to systemd’s journald service. This service will augment the entry with a number of meta fields. The values of these trusted fields are determined by the journal service itself and cannot be faked by the client side. In case hardware and kernel devices are involved, the journal service will augment the log entry with the currently available device information from the udev database, which stores all known device names and symlinks, and other associated device data in the journal entry.

应用程序和服务可以通过将条目字段传递给 systemd 的 journald 服务来在日志中生成条目。journal 将增加许多元字段来扩充条目。这些受信任字段的值由日志服务本身确定，客户端不能伪造。如果涉及硬件和内核设备，日志服务将使用 udev 数据库中当前可用的设备信息来扩充日志条目，udev 数据库存储了所有已知设备名称和符号链接以及日志条目中的其他设备关联数据。


The fields the journal daemon adds are prefixed with an underscore (“_”) as an indication that this field is trusted and not supplied by a potentially rogue client. Applications themselves cannot pass field names starting with an underscore. Here’s an example how an entry sent from a client after augmentation might look:

日志守护程序添加的字段以下划线（“_” 作为前缀，表示此字段受信任，并且不是由潜在的恶意客户端提供的。应用程序本身不能传递以下划线开头的字段名。下面是一个示例，说明在增强后从客户机发送的条目的外观：


```
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
```


This example entry is generated by systemd's logind daemon when a user “harald” logs in. As you can see the automatically added data is quite comprehensive and includes a number of important process execution parameters. For a longer explanation on the various well-known fields defined see:

这个示例条目是在用户 “harald” 登录时由 systemd 的 logind 守护进程生成的。如你所见，自动添加的数据非常全面，包括许多重要的进程参数。有关定义的各种已知字段的详细说明，请参见： [https://docs.google.com/document/pub?id=1MqQpm-ey8yVDPY8QVL155pvivay3Ut09dKxeVyNCrp8](https://docs.google.com/document/pub?id=1MqQpm-ey8yVDPY8QVL155pvivay3Ut09dKxeVyNCrp8)


The native journal file format is inspired by classic log files as well as git repositories. It is designed in a way that log data is only attached at the end (in order to ensure robustness and atomicity with mmap()-based access), with some meta data changes in the header to reference the new additions. The fields, an entry consists off, are stored as individual objects in the journal file, which are then referenced by all entries, which need them. This saves substantial disk space since journal entries are usually highly repetitive (think: every local message will include the same _HOSTNAME= and _MACHINE_ID= field). Data fields are compressed in order to save disk space. The net effect is that even though substantially more meta data is logged by the journal than by classic syslog the disk footprint does not immediately reflect that.

原生 journal 文件格式受经典日志文件和 git 仓库的启发。它的设计方式是只在末尾附加日志数据（以确保基于 mmap 的访问的健壮性和原子性），在头中更改一些元数据以关联新添加的内容。日志中的字段以单独的对象存储在日志文件中，然后由需要它们的所有条目引用。这节省了大量的磁盘空间，因为日志条目通常是高度重复的（想想：每个本地消息将包含相同的 _HOSTNAME = 和 _MACHINE_ID = 字段）。数据字段被压缩以节省磁盘空间。最终的效果是，即使日志记录的元数据比经典系统日志记录的元数据多得多，但磁盘占用空间并没这么多。


The on disk format uses exclusively 64bit LE (little endian) offsets, in order to simplify things and ensure we can store blob data of substantial sizes. No synchronization between log browser tools and journald is necessary, clients which want to browse the journal files can simply mmap() the journal files and use file change notifications for information about updates.

磁盘格式专门使用 64 位 LE（little endian）偏移量，以简化操作并确保可以存储大量的 blob 数据。日志浏览器工具和日志之间不需要同步，想要浏览日志文件的客户端只需 mmap 日志文件，并使用文件变化通知机制获取文件更新信息。


A client library to allow access to the journal files is available, which enables indexed access to entries via any field, and with random access via monotonic or wallclock timestamps. The client library automatically coalesces multiple journal files so that they appear as a single unified stream of journal entries. This is used to hide whether journal files are archived (i.e. “rotated”) or belong to multiple users. The transparent merging of journal files in the browsing interface is fully dynamic: as new journal files are created or old ones deleted the browser view is automatically updated. In fact, journal browsing is intended to be live, to enable real-time monitoring of journal sources.

有一个可用的允许访问日志文件的客户端库，它可以对任何字段进行索引，并通过递增字段或者时间戳可以实现随机访问。client库自动合并多个日志文件，使它们显示为一个统一的日志流。这样你不用关心日志文件是存档（即 “旋转”）亦或是属于多个用户。浏览界面中日志文件的合并是透明和完全动态的：创建新日志文件或删除旧日志文件时，浏览器视图会自动更新。事实上，journal 被设计成实时性，以实现对来源数据的实时监控。

http://cgit.freedesktop.org/systemd/tree/src/journal/sd-journal.h?h=journal


Messages from unprivileged login users are split off into individual journal files, one per user. Using POSIX ACLs for controlling read access, it is ensured that users can access their own journal files. The journal entries generated by system services are by default not accessible by normal users, unless they are a member of a special Unix group. Note that the separation of files happens to accommodate for proper access control, but the global contexts of log entries is not lost, due to the client side coalescing of journal files, and by enforcing a single needle eye all messages are passed through to guarantee global ordering by automatically assigned sequence numbers. In effect this means that access control is guaranteed without compromise regarding the context of user journal entries.

来自未经授权的登录用户的消息被分割成单独的日志文件，每个用户一个。使用 POSIX acl 控制读取访问，可以确保用户可以访问自己的日志文件。由系统服务生成的日记条目在默认情况下不能被普通用户访问，除非他们是特别的 Unix 组的成员。注意，文件的分离做到了适当的访问控制，同时日志条目的全局上下文不会丢失，因为客户端合并了日志文件，并且通过强制 single needle eye，所有消息都会通过自动分配的序列号, 这样保证了全局排序。实际上，这意味着，不影响用户日记条目的上下文的前提下，可以做到访问控制。


One of the core ideas of the journal is to unify the various logging technologies we currently have. As such it should be useful as replacement for wtmp, early boot loggers and even the audit logging backend. Data can be generated from a variety of sources: kernel messages generated with printk(), userspace messages generated with syslog(3), userspace entries using the native API, coredumps via /proc/proc/sys/kernel/core_pattern and more. Later on we hope to hook up firmware messages (UEFI logs) and extend kernel based logging to support in-kernel structured logging. Since all fields are implicitly indexed in the journal data structure it is a relatively cheap operation to extract user data like from wtmp from the journal. Early-boot and runtime logging are unified. As long as /var is not available, all journal entries are automatically stored on /run, and then flushed to /var as soon as it is available. This means that ultimately all messages generated by the system, regardless whether by the firmware during POST, during kernel initialisation, during early boot or at runtime, end up in the same indexed journal files.

Journal 的核心思想之一是统一我们目前拥有的各种日志技术。因此，它应该可以替代 wtmp，早期的系统启动日志系统，甚至审计日志后端系统。数据可以从多种来源生成：printk 生成的内核消息、syslog 生成的用户空间消息、使用原生 API 的用户空间条目、通过 /proc/proc/sys/kernel/core_pattern 生成的 coredumps 等等。之后，我们希望 hook up 固件消息（UEFI 日志）并扩展基于内核的日志，以支持内核结构化日志记录。由于所有字段都隐式地索引在日志数据结构中，因此从日志中提取用户数据（如从 wtmp 中提取）是一种相对廉价的操作。引导日志和运行时日志记录是统一的。如果 /var 不可用，所有日记都会自动存储在 /run 上，然后在 /var 可用时立即刷新过去。这意味着，最终系统生成的所有消息，无论是在 POST 期间、内核初始化期间、早期引导期间还是在运行时由固件生成的，最终都会出现在相同的索引日志文件中。


In order to make entries recognisable to client utilities, journal entries may optionally carry a 128bit identifier in MESSAGE_ID=, set by the service generating the message. This ID shall be a randomly generated ID by the developer at development time. For example, there’s one ID for “User logged out” and another one for “User logged in”. All entries for these events will carry the respective 128bit ID thus making them easily recognisable, and implicitly indexed by them. It is a good idea to use IDs for this which are compatible with RFC4122 UUID of type 4, however this is not strictly required and not enforced. This is designed to be compatible with other logging systems which use UUIDs to identify message types, such as the UEFI firmware logs. Consider these 128bit IDs global error codes, that due to their randomized nature need no central standardization entity that assigns numeric IDs to specific message types. Assigning message IDs is entirely optional, and we expect that only a minority of journal entries will carry them, i.e. only those which need to be recognisable by userspace. If a developer needs a new 128bit ID to assign to a new message type he introduced, all he needs to do is run “cat /proc/sys/kernel/random/uuid” which returns a new UUID on each invocation. The 128bit IDs can also be used to implement localized message UIs, which look up messages in a language catalog and present the translated message to the user, entirely in the UI tool.

为了使客户机实用程序能够识别条目，日记条目可以选择在消息 \u ID = 中携带 128 位标识符，该标识符由生成消息的服务设置。这个 ID 应该是开发人员在开发时随机生成的 ID。例如，有一个 ID 表示 “User logged out”，另一个 ID 表示 “User logged in”。这些事件的所有条目都将携带各自的 128 位 ID，从而使它们易于识别，并由它们隐式索引。使用与类型 4 的 RFC4122 UUID 兼容的 id 是一个好主意，但是这不是严格要求的，也不是强制的。这是为了与其他使用 uuid 识别消息类型的日志系统兼容，例如 UEFI 固件日志。考虑这些 128 位 IDs 全局错误代码，由于其随机化性质，不需要中央标准化实体为特定消息类型分配数字 id。分配消息 ID 是完全可选的，我们希望只有少数日记条目会携带它们，即只有那些需要由用户空间识别的条目。如果开发人员需要一个新的 128 位 ID 来分配给他引入的新消息类型，那么他所需要做的就是运行 “cat/proc/sys/kernel/random/uuid”，它在每次调用时返回一个新的 uuid。128 位的 id 还可以用来实现本地化的消息 UI，它在语言目录中查找消息，并将翻译后的消息完全在 UI 工具中呈现给用户。


All entries are implicitly timestamped with the realtime (i.e. wallclock) and monotonic clock. To make the monotonic timestamps useful all messages also carry the boot ID of the running Linux kernel (i.e. /proc/sys/kernel/random/boot_id). The accuracy is 1usec, and the wallclock is stored in usec since the epoch UTC in order to avoid the timezone problems syslog is suffering by.
所有条目都隐式地用 realtime（即 wallclock）和 monotic clock 标记时间戳。为了使单调的时间戳有用，所有消息还携带正在运行的 Linux 内核的引导 ID（即 /proc/sys/kernel/random/boot\u ID）。准确度为 1sec，并且挂钟从 UTC 纪元开始存储在 usec 中，以避免 syslog 遇到的时区问题。





Journal files can be rotated, deleted, copied to other machines, merged, or otherwise manipulated. In order to ensure that applications, synchronization tools and network services can reliably identify entries all journal entries can be identified by a cursor string. Such a string identifies a specific message and stays stable even when an entry is lost or not available, and then can be used to locate the next closest entry.
日志文件可以旋转、删除、复制到其他机器、合并或以其他方式操作。为了确保应用程序、同步工具和网络服务能够可靠地标识分录，所有日记账分录都可以用光标字符串标识。这样的字符串标识特定的消息，即使条目丢失或不可用也保持稳定，然后可以用来定位下一个最近的条目。





journald automatically rotates journal files if they grow above certain limits. This is built right into the disk space allocation logic, in order to avoid vulnerability windows due to purely time-based rotation. Rotation not only takes a maximum disk usage limit into account, but also monitors general disk usage levels in order to ensure that a certain amount of space is always kept free on disk.

如果日志文件超过一定的限制，journald 会自动旋转日志文件。这是建立在磁盘空间分配逻辑的权利，以避免漏洞窗口由于纯粹的基于时间的旋转。轮换不仅要考虑磁盘使用的最大限制，还要监视磁盘的一般使用级别，以确保磁盘上始终有一定的可用空间。





Entries sent by clients are subject to implicit rate limiting, to avoid that rogue clients can flush relevant data out of the journal, by flooding it with is own data. The rate is adjusted by the amount of available disk space, so that higher message rates are allowed when disk space is generous and lower rates enforced when disk space is scarce
客户端发送的条目受到隐式速率限制，以避免恶意客户端通过向日志中注入自己的数据，将相关数据从日志中冲出。速率由可用磁盘空间量调整，以便在磁盘空间充足时允许较高的消息速率，而在磁盘空间不足时强制执行较低的速率





In the initial version journald’s network support will be very simple: to share journal files across the network, simply copy them to a central host with a tool like scp, rsync or via NFS. The journal browser client tool will then transparently merge these files, interleaving them as necessary. In a later version we plan to extend the journal minimally to support live remote logging, in both PUSH and PULL modes always using a local journal as buffer for a store-and-forward logic. Regardless which mode of transportation is used, the underlying journal format is designed to be scalable to large numbers of hosts and all entries are identified by both the machine ID and the host name. The goal is to implement an efficient journal monitoring tool that can browse journals from a multitude of hosts transparently and live, while leaving to the administrator the choice of transport so that he can adjust it to his own needs, i.e. whether live functionality is more important than avoiding the thundering herd, and other considerations.

在初始版本中，journald 的网络支持将非常简单：要在网络上共享日志文件，只需使用 scp、rsync 或通过 NFS 等工具将它们复制到中心主机。然后，journalbrowser 客户机工具将透明地合并这些文件，并根据需要将它们交错。在以后的版本中，我们计划对日志进行最小程度的扩展，以支持实时远程日志记录，在推送和拉送模式下，总是使用本地日志作为存储转发逻辑的缓冲区。无论使用哪种传输模式，底层日志格式都设计为可扩展到大量主机，并且所有条目都由计算机 ID 和主机名标识。我们的目标是实现一个高效的日志监控工具，该工具可以透明地实时浏览来自多个主机的日志，同时让管理员选择传输，以便他可以根据自己的需要进行调整，即实时功能是否比避免雷鸣群更重要，以及其他考虑因素。





The Internet is a dangerous place. Break-ins on high-profile web sites have become very common. After a successful break-in the attacker usually attempts to hide his traces by editing the log files. Such manipulations are hard to detect with classic syslog: since the files are plain text files no cryptographic authentication is done, and changes are not tracked. Inspired by git, in the journal all entries are cryptographically hashed along with the hash of the previous entry in the file. This results in a chain of entries, where each entry authenticates all previous ones. If the top-most hash is regularly saved to a secure write-once location, the full chain is authenticated by it. Manipulations by the attacker can hence easily be detected.

互联网是一个危险的地方。闯入知名网站已经变得非常普遍。成功闯入后，攻击者通常试图通过编辑日志文件来隐藏其踪迹。这样的操作很难在经典的 syslog 中检测到：因为文件是纯文本文件，所以不会进行加密身份验证，也不会跟踪更改。受 git 的启发，日志中的所有条目都以加密方式与文件中前一条条目的哈希一起进行哈希处理。这会产生一个条目链，其中每个条目都会对之前的所有条目进行身份验证。如果最上面的散列定期保存到一个安全的一次写入位置，则整个链将由它进行身份验证。因此，攻击者的操作很容易被检测到。


As mentioned logging is an essential part of service management. That not only refers to the fact that the service’s own log output needs to be channeled to the journal, but also that journal entries are generated for external service events, for example, each time when a service starts, fails, stops or crashes.

如前所述，日志记录是服务管理的重要组成部分。这不仅意味着服务本身的日志输出需要传输到日志，而且还意味着日志条目是为外部服务事件生成的，例如，每次服务启动、失败、停止或崩溃时。




The journal daemon journald replaces the two mini daemons systemd already ships that are related to logging (systemd-kmsg-syslogd and systemd-stdout-syslog-bridge) right from the beginning. In the long run we hope to replace the traditional syslog daemons on many installations, but not conflict with them. The net footprint of a Linux system should shrink, due the reduction of services run (1 in place of 3), and because journald is actually much less code than a full-blown syslog daemon.

journal 守护程序 journald 从一开始就替换了 systemd 已经提供的两个与日志记录相关的迷你守护程序（systemd kmsg syslogd 和 systemd stdout syslog bridge）。从长远来看，我们希望在许多安装上取代传统的 syslog 守护进程，但不要与之冲突。由于运行的服务减少（1 代替 3），而且 journald 实际上比一个完整的 syslog 守护进程的代码少得多，Linux 系统的净占用空间应该会缩小。




## Current Status
At this point in time, the core functionality and all non-trivial algorithms are implemented and available in the “journal” branch in systemd git. The code however is not complete, and missing a number of features pointed out above.

当前状态在这个时间点上，核心功能和所有非平凡算法都在 systemdgit 的 “journal” 分支中实现并可用。然而，代码并不完整，并且缺少上面指出的一些特性。





This blog story we put together to clear up a few misconceptions of our plans, choices and reasons that have been uttered in the community.

我们把这个博客故事放在一起，是为了澄清社区中对我们的计划、选择和理由的一些误解。





It is our intention to put an initial implementation of this into Fedora 17, but hook up only very few selected components directly with it in the first iteration. rsyslog will run side-by-side with it, and the user should notice very little of journald, except that “systemctl status” will start to show recent log output for all services. Unless of course he plays around with our new client tools, like “journalctl” which may be used to search the (indexed) journal.
我们打算在 fedora17 中初步实现这个功能，但是在第一次迭代中只直接连接很少几个选定的组件。rsyslog 将与之并行运行，用户应该很少注意 journald，只是 “systemctl status” 将开始显示所有服务的最新日志输出。当然，除非他使用我们的新客户机工具，比如 “journalctl”，它可以用来搜索（索引的）日志。


## Frequently Asked Questions
We have been discussing the design above with a number of people from various backgrounds in the past weeks, collecting ideas, suggestions and criticism. A couple of points were raised very vocally, and repeatedly. Here’s a list of them with our answers:
解答在过去的几周里，我们与许多不同背景的人讨论了上述设计，收集了一些想法、建议和批评。有几点是非常有声调的，而且是反复提出来的。以下是我们的答案列表：





The journal is cool, but systemd is an abomination, can I use the journald without systemd?
日志很酷，但是 systemd 是个讨厌的东西，我可以不用 systemd 使用日志吗？





No, you can’t. Logging is a core part of service management. The journal is tightly integrated with the rest of systemd to ensure that everything in the system can be monitored, introspected and debugged. The generated journal entries are queried from various components in systemd. In effect systemd and journald are so tightly coupled that separating them would make little sense. That said, it’s Free Software, so you can do with the code whatever suits you. Finally, you are actually wrong in believing that systemd was an abomination.

不，你不能。日志记录是服务管理的核心部分。该日志与 systemd 的其余部分紧密集成，以确保系统中的所有内容都可以被监视、自省和调试。生成的日记账分录是从 systemd 中的各个组件查询的。实际上，systemd 和 journald 是如此紧密地耦合在一起，将它们分开是毫无意义的。也就是说，它是免费软件，所以你可以用代码做任何适合你的事情。最后，你认为 systemd 是一个令人憎恶的东西，这实际上是错误的。





Does running the journal break rsyslog/syslog-ng?
运行日志是否会中断 rsyslog/syslog ng？





No, it doesn’t. You may run rsyslog or syslog-ng side-by-side with journald, and syslog messages will end up in both rsyslog/syslog-ng and the journal. However, the journal will store a lot of meta data along with the syslog messages that plain syslog won’t.
不，没有。您可以与 journald 并排运行 rsyslog 或 syslog ng，syslog 消息将同时出现在 rsyslog/syslog ng 和 journal 中。但是，日志将存储大量元数据以及普通 syslog 无法存储的 syslog 消息。





My application needs traditional text log files on disk, can I configure journald to generate those?

我的应用程序需要磁盘上的传统文本日志文件，我可以配置日志来生成这些文件吗？





No, you can’t. If you need this, just run the journal side-by-side with a traditional syslog implementation like rsyslog which can generate this file for you.
不，你不能。如果你需要这个，就用 rsyslog 这样的传统 syslog 实现并行运行日志，它可以为你生成这个文件。





Why doesn’t the journal generate traditional log files?

为什么日志不生成传统的日志文件？





Well, for starters, traditional log files are not indexed, and many key operations very slow with a complexity of O(n). The native journal file format allows O(log(n)) complexity or better for all important operations. For more reasons, refer to the sections above.
好吧，对于初学者来说，传统的日志文件没有索引，许多关键操作非常慢，复杂性为 O（n）。原生日志文件格式允许 O（log（n））复杂度或更好的所有重要操作。有关更多原因，请参阅以上各节。





Can I connect a remote RFC compliant syslog protocol message generator to the journal?
我可以将远程 RFC 兼容的 syslog 协议消息生成器连接到日志吗？





At this point in time, no, you can’t. And it is unlikely that journald will ever support this out-of-the-box. However, it shouldn’t be too difficult to write a converter or gateway tool to make this work.
在这一点上，不，你不能。这是不可能的，日志将永远支持这一开箱即用。但是，编写转换器或网关工具来实现这一点应该不会太困难。





I am using systemd on an embedded system and am not interested in persistent logging, can I opt out of the journal?
我在嵌入式系统上使用 systemd，对持久性日志不感兴趣，我可以选择退出日志吗？




No you can’t really. However, what you can do is tell systemd that you don’t want persistent logging, by removing (or not creating in the first place) the /var/log/journal directory, in which case journald will log only to /run/log/journal (which it does in any case during early boot). /run is volatile and lost on reboots, in contrast to /var. On top of that you can configure the maximum disk space the journal may consume to a low value.
不，你真的不能。但是，您可以通过删除（或者不首先创建）/var/log/journal 目录来告诉 systemd 您不需要持久日志记录，在这种情况下，journald 将只记录到 /run/log/journal（在任何情况下，在早期引导期间都会这样做）。/ 与 /var 不同，run 是不稳定的，并且在重新启动时丢失。除此之外，您可以将日志可能消耗的最大磁盘空间配置为一个较低的值。





UUIDs are broken, everybody knows that. Why are you using UUIDs to identify messages?
UUID 坏了，大家都知道。为什么要使用 uuid 来识别消息？





Well, it is true that the UUID specification is baroque and needlessly complex. Due to that we recommend sticking to UUID Type 4 and ignoring the rest of RFC 4122. UUIDs actually have a long successful history on Linux. For example, all distributions by default mount file systems exclusively by their file system UUIDs.
好吧，UUID 规范确实是巴洛克式的，不必要的复杂。因此，我们建议坚持使用 UUID 类型 4，而忽略 rfc4122 的其余部分。uuid 实际上在 Linux 上有很长的成功历史。例如，默认情况下，所有发行版都只通过其文件系统 uuid 装载文件系统。





But meh, UUIDs never worked! i.e. MAC addresses are duplicated and all my USB devices have the same one! Why do you insist on using them?
但是，UUIDs 从来没用过！i、 MAC 地址是重复的，我所有的 USB 设备都有一个！你为什么坚持要用它们？





Well, we are using them all the time, in file systems for example, as already mentioned above, and they do their job very nicely there and always have. Hardware carries serial numbers that many vendors initialize to 1-2-3-4-5 or similar, but that has very little to do with the general idea of UUIDs. Device serial numbers aren’t UUIDs. Don’t mix them up!
好吧，我们一直在使用它们，例如在文件系统中，正如前面提到的，它们在那里做得非常好，而且一直都有。硬件携带序列号，许多供应商将其初始化为 1-2-3-4-5 或类似的序列号，但这与 uuid 的总体概念关系不大。设备序列号不是 uuid。别把它们弄混了！





In addition, we are not insisting on them. As mentioned above they are fully optional, and should only be assigned to those messages that shall be recognisable later on.
此外，我们也没有坚持。如上所述，它们是完全可选的，应该只分配给那些以后可以识别的消息。





But if I introduce a UUID for a message type in my code and somebody uses this code as a template for some new work then the journal breaks.
但是如果我在代码中为消息类型引入了 UUID，并且有人将此代码用作一些新工作的模板，那么日志就会中断。



No, this is wrong. Why? Simply because the same 128bit ID should be assigned to the same error condition/entry type, regardless from which source it comes. e.g. the 128bit ID that is used to identify “Sector bad on block device” should be the same regardless which device generates the message, or which driver. If userspace software needs to distinguish journal entries from different services, drivers or devices, it should use additional journal matches on the service/device/driver fields.
不，这是错的。为什么？这仅仅是因为同一个 128 位的 ID 应该分配给同一个错误条件 / 条目类型，而不管它来自哪个源。e、 g. 用于标识 “块设备上的扇区坏” 的 128 位 ID 应相同，无论哪个设备生成消息或哪个驱动程序。如果用户空间软件需要区分来自不同服务、驱动程序或设备的日志条目，则应在服务 / 设备 / 驱动程序字段中使用其他日志匹配项。





Or in other words, what you are pointing out is actually a good thing. We specifically encourage people to reuse message IDs, which describe the same thing, in their software, instead of inventing new ones.
换句话说，你所指出的其实是件好事。我们特别鼓励人们在他们的软件中重用描述相同事物的消息 ID，而不是发明新的消息 ID。





But still, the printf()/printk() format strings of the messages would be much better for identifying message types!
但是，消息的 printf（）/printk（）格式字符串在识别消息类型方面会更好！





That’s actually not really the case. Ultimately format strings are just human language templates. And human language is fragile for message type identification: every corrected spelling mistake would alter the message type, and cause journal clients to misidentify messages. Every time a journal message is extended, reworded, rewritten an ABI break takes places. Or to turn this around: by using message format strings as identifiers every message of the kernel becomes ABI, and turning human language into ABI is fatal. Effectively, little is gained over the classic regex log matching at a very steep price of making all log messages ABI. OTOH messages IDs can stay unaltered when their human languages strings are altered, thus neatly separating ABI from the human language.

事实并非如此。格式字符串最终只是人类语言模板。而且人类语言对于消息类型识别是脆弱的：每一个更正的拼写错误都会改变消息类型，并导致日志客户端错误识别消息。每次日志消息被扩展、重写、重写时，都会发生 ABI 中断。或者扭转这种局面：通过使用消息格式字符串作为标识符，内核中的每条消息都变成了 ABI，而将人类语言变成 ABI 是致命的。实际上，与经典的 regex 日志匹配相比，几乎得不到什么好处，代价非常高昂，使所有日志消息都成为 ABI。OTOH 消息 id 可以在其人类语言字符串被改变时保持不变，从而将 ABI 与人类语言巧妙地分离开来。




You guys really don’t get it! You should totally use the source code file name and location as identifier for messages!

你们真的不明白！您应该完全使用源代码文件名和位置作为消息的标识符！




This is not really feasible, since it would turn the source code location into ABI: every time the developer adds a new line of code at the top of his .c file all message IDs would change. This would be major problem.
这实际上是不可行的，因为它会将源代码位置转换为 ABI：每次开发人员在其.c 文件的顶部添加一行新代码时，所有消息 id 都会更改。这将是一个大问题。





Who would organize and manage the UUID namespace and generate UUIDs? Seriously, we don’t need more bureaucracy people will only ignore!
谁来组织和管理 UUID 名称空间并生成 UUID？说真的，我们不需要更多的官僚主义，人们只会忽视！





The nice thing about 128bit random IDs is that their namespace does not need to be managed. Everybody can just pull a random UUID out of /proc/sys/kernel/random/uuid, and it is his. Developers can generate as many UUIDs as they need without having to ask any central entity. UUIDs allow us to have a common namespace without any bureaucracy.
128 位随机 ID 的好处是它们的命名空间不需要管理。每个人都可以从 /proc/sys/kernel/random/UUID 中提取一个随机 UUID，它就是他的。开发人员可以生成任意数量的 uuid，而不必询问任何中心实体。uuid 允许我们拥有一个公共名称空间，而不需要任何官僚机构。





But come on, seriously! UUIDS? From which planet are you!? Everybody knows that an agency like LANANA would be ideal for assigning globally unique message type IDs to applications!
但是拜托，说真的！UUID？你来自哪个星球！？每个人都知道，像 LANANA 这样的机构非常适合为应用程序分配全局唯一的消息类型 id！





Linux is not an island. It’s highly desirable that message IDs used by other infrastructure seamlessly integrates with what we do in the Journal. Hence we pick something that makes sense and is already used elsewhere. Also, UUIDs are essentially little more than a global namespace for unique identifiers that needs no central organization. Why have the bureaucracy of a central understaffed registrar if you don’t have to?
Linux 不是一个孤岛。其他基础设施使用的消息 ID 与我们在日志中所做的无缝集成是非常理想的。因此，我们选择一些有意义的东西，并已在其他地方使用。而且，uuid 本质上只不过是唯一标识符的全局名称空间，不需要中央组织。如果你不需要的话，为什么中央书记官的官僚机构人手不足呢？





Nah, you should use reverse domain name notation to identify message types, like Java!
不，您应该使用反向域名表示法来标识消息类型，比如 Java！





Comparing strings is substantially more complex that comparing fixed size IDs. Also, let’s face it, this wouldn’t solve the namespacing issue anyway, since 90% of all message types would probably be in the same namespaces: org.freedesktop resp. org.kernel.
比较字符串比比较固定大小的 ID 要复杂得多。另外，让我们面对现实，这并不能解决名称空间问题，因为 90% 的消息类型可能都在相同的名称空间中：组织免费桌面负责。组织内核.





But ASN.1 OIDs would make great message type identifiers!
但是 ASN.1oids 会成为很好的消息类型标识符！





Dude, seriously?

伙计，说真的？




Now I have an even better idea, what about using URLs as message type IDs?

现在我有了一个更好的主意，使用 url 作为消息类型 id 怎么样？





Well, they offer little advantage over reverse domain name notation, don’t they?
嗯，它们比反向域名标记法没有什么优势，不是吗？





But guys, really. If you always generate a UUID on each entry that is generated my entire entropy pool will always be drained!
但伙计们，真的。如果您总是在生成的每个条目上生成一个 UUID，那么我的整个熵池将始终被耗尽！





Read the blog story again, as you apparently didn’t read it very carefully. The 128bit message type IDs are assigned by the developer when he needs one to identify a specific message type at the time of developing, not at runtime. Most projects will probably never generate more than 30 of these during their entire development time, and the entropy for that should be trivially available on developer machines, even 10 years old.
再读一遍这个博客故事，因为你显然读得不太仔细。128 位消息类型 ID 是由开发人员在开发时（而不是在运行时）需要一个 ID 来标识特定的消息类型时分配的。大多数项目在其整个开发过程中可能永远不会生成超过 30 个这样的信息，而在开发人员机器上，甚至 10 年前，这些信息的熵应该是微不足道的。





You crazy userspace kids, first you force me to use have 20 cpu cgroups on my system, and now you force me to have stinky UUIDs on my system?
你们这些疯狂的用户空间的孩子，先是你们强迫我在我的系统上使用 20 个 cpu cgroup，现在你们又强迫我在我的系统上使用糟糕的 uuid？





Well, ignoring the fact that we don’t force you to have 20 cpu cgroups, and that you are almost definitely already using UUIDs all the time because your file systems are found via UUIDs at boot time -- consider them an implementation detail, and if you don’t like them, then you don’t have to attach them to your messages. That comes at the price that the messages aren’t recognisable though, except via regex matching horrors. But hey, maybe that’s what you want? And anyway, we don’t force anybody to do anything anyway.
好吧，忽略这样一个事实：我们不强迫您拥有 20 个 cpu cgroup，而且您几乎肯定已经在一直使用 uuid 了，因为您的文件系统是在启动时通过 uuid 找到的 —— 将它们视为一个实现细节，如果您不喜欢它们，那么您不必将它们附加到消息中。不过，这样做的代价是，除了通过 regex 匹配的 horrors，这些消息是无法识别的。但嘿，也许这就是你想要的？不管怎样，我们不会强迫任何人做任何事。





So you are splitting up journal entries based on the user ID of the user sending them. But how do you make sure that the user doesn’t lie about who he is?
因此，您将根据发送日记条目的用户的用户 ID 来拆分日记条目。但是你如何确保用户不会谎报他是谁呢？






Thankfully, the Linux kernel supports SCM_CREDENTIALS, which provides us with information about the sender of a message he cannot fake.

值得庆幸的是，Linux 内核支持 SCM\u 凭证，它为我们提供了关于消息发送者的信息，他不能伪造消息。


Will the journal file format be standardized? Where can I find an explanation of the on-disk data structures?

日志文件格式会标准化吗？在哪里可以找到磁盘上数据结构的解释？





At this point we have no intention to standardize the format and we take the liberty to alter it as we see fit. We might document the on-disk format eventually, but at this point we don’t want any other software to read, write or manipulate our journal files directly. The access is granted by a shared library and a command line tool. (But then again, it’s Free Software, so you can always read the source code!)

在这一点上，我们并不打算标准化的格式，我们采取的自由，以改变它，因为我们认为合适。我们可能最终会记录磁盘上的格式，但在这一点上，我们不希望任何其他软件直接读取、写入或操作我们的日志文件。访问权限由共享库和命令行工具授予。（但话说回来，它是免费软件，所以您可以随时阅读源代码！）





Why do you guys reinvent the wheel, again? Why not just add what you need to existing syslog? If you just clean up your log formatting, syslog should be fine!
你们为什么要重新发明轮子？为什么不把你需要的东西添加到现有的系统日志中呢？如果你只是清理你的日志格式，系统日志应该是好的！





Well, sometimes improving an existing solution is the way to go, but when the changes necessary are too major a reinvention is a good thing, if it is done for the right reasons, and provides good compatibility with previous solutions. We believe we are doing it for the right reasons, and we try hard to provide greatest possible compatibility.

好吧，有时改进现有的解决方案是一种方法，但是当必要的更改太大时，重新设计是一件好事，如果它是出于正确的原因进行的，并且与以前的解决方案具有良好的兼容性。我们相信我们这样做的理由是正确的，我们努力提供最大可能的兼容性。





And no, just fixing the log formatting won’t get you much. Not even the most basic requirements like binary blobs or sensible structured logging. Let alone stuff like indexing or proper access control.

不，仅仅修改日志格式并不会给你带来什么好处。即使是最基本的要求，如二进制 blob 或合理的结构化日志记录。更不用说索引或适当的访问控制了。





Does the journal obsolete syslog entirely?

日志是否完全过时了系统日志？





No, first of all, the syslog API syslog(3) is supported as first-class interface to write log messages, and continues to be the primary API for all simple text logging. However, as soon as meta data (especially binary meta data) shall be attached to an entry the native journal API should be used instead.

不，首先，syslog API syslog（3）被支持作为编写日志消息的第一类接口，并且仍然是所有简单文本日志记录的主要 API。然而，一旦元数据（尤其是二进制元数据）被附加到条目上，就应该使用本机日志 API。





Secondly, the journal is an entirely new thing. OTOH, Syslog is an industry standard (though a pretty weakly defined one, given that its log format is barely agreed on), and a widely accepted one, which is implemented in numerous operating systems, applications and devices. As such, syslog will continue to be important and will be needed on many many installations. The journal daemon does not speak the RFC syslog protocol, and it is unlikely it ever will. Wherever protocol compatibility with syslog is required, a classic syslog implementation needs to be used. To ensure this works nicely, we implemented the journal so that it can cooperate cleanly with a local syslog daemon and messages are forwarded as needed so that syslog continues to work exactly as it did without journald in the mix.

其次，期刊是一个全新的事物。另外，Syslog 是一个行业标准（尽管它的定义很弱，因为它的日志格式几乎没有达成一致），也是一个被广泛接受的标准，在许多操作系统、应用程序和设备中都有实现。因此，syslog 将继续是重要的，并且在许多安装中都是必需的。日志守护进程不使用 RFC syslog 协议，而且不太可能使用。只要需要与 syslog 的协议兼容性，就需要使用经典的 syslog 实现。为了确保这一点很好地工作，我们实现了 journal，这样它就可以与本地 syslog 守护进程进行干净的协作，并根据需要转发消息，这样 syslog 就可以像没有 journald 时一样继续工作。




And this is where You come in!
Before putting together this design we spoke to a number of high profile log users, including users with more than a hundred thousand active hosts. We also spoke to a number of engineers who worked in the area or might become major users of the journal. We were particularly interested in usage patterns, and scalability issues. However, of course every installation has its own needs and requirements. Thus we’d like to ask you to contact us in case there’s some important functionality you’d need for your specific setup that you currently don’t find covered in the design pointed out above. The design above focuses exclusively on the lower layers of the logging stack. Specific UIs are out of focus for us, for now, thus we’d like to ask you to leave comments about them for a later time. Also, it’s not Christmas yet, so we are unlikely to fulfil all wishes (please don’t be disappointed!), but it matters to us to learn about them, and we can promise that we’ll at least consider them! Thank you very much in advance!

这就是你进来的地方！在完成这一设计之前，我们与许多知名度很高的日志用户进行了交谈，其中包括拥有超过十万个活动主机的用户。我们还采访了一些在该领域工作或可能成为该杂志主要用户的工程师。我们对使用模式和可伸缩性问题特别感兴趣。当然，每个安装都有自己的需要和要求。因此，我们想请您联系我们，以防有一些重要的功能，您需要为您的具体设置，您目前没有发现在上述设计涵盖。上面的设计只关注于日志堆栈的较低层。具体的用户界面是我们的重点，目前，因此我们想请您留下评论，他们为以后的时间。而且，现在还不是圣诞节，所以我们不太可能实现所有的愿望（请不要失望！），但对我们来说，了解他们很重要，我们可以保证，我们至少会考虑他们！事先非常感谢！



