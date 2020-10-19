---

date: 2020-08-17T15:58:11+0800
title: '[译]Why Should We Separate A and AAAA DNS Queries'

---

## 写在最前

是看了朋友一篇文章[https://leeweir.github.io/posts/wget-curl-does-not-resolve-domain-properly/](https://leeweir.github.io/posts/wget-curl-does-not-resolve-domain-properly/), 直接拉到最后的根因, 看到里面写:

> 不指定协议访问的时候，为什么直接从缓存里返回了结果而不做dns解析，还是要具体从libcurl的实现上去分析

第一反应是不太可能, curl 的请求不会因为指定使用 ipv4 就做 DNS 解析,  ipv6 不做. libcurl 不可能这么实现.

然后去翻了 libcurl 的代码, 他是使用[另外一个叫 ARES 库](https://github.com/c-ares/c-ares)去做的 DNS 解析. 在 ARES 中看到有解析 ipv6 的时候, 使用了多线程(细节有些记不清了). 然后搜索文章, 就看到了下面这篇文章: 为什么我们要分开请求 A 和 AAAA DNS?

[Why Should We Separate A and AAAA DNS Queries?](https://blogs.infoblox.com/ipv6-coe/why-should-we-separate-a-and-aaaa-dns-queries/)

Imagine what it was like to be an ancient mariner navigating the ocean blue at night using nothing more than stars, a sextant and a marine chronometer.  Thankfully, navigating the Internet is not as daunting.  The method that networked devices use to find their way around the digital ocean is the Domain Name System (DNS), which translates human-readable host and domain names into numerical IP addresses (and vice versa).

Separate DNS Queries
One aspect of dual-protocol behavior that often surprises peoples is that hosts send two separate DNS queries to their resolver.  And today, frankly, all hosts are dual-protocol bilingual and can use either IP version (4 or 6) for their DNS traffic or for the DNS queries and responses contained within.  The reason that there are separate IPv4 A record and IPv6 AAAA record DNS queries is that early IPv6 deployments occasionally encountered problems with older IPv4-only resolvers.

If a host sent an ANY query or an IPv6 AAAA DNS query to a resolver which was not IPv6-literate, the resolver would return an erroneous response code (RCODE) such as NXDOMAIN.  The would lead the host to believe that the domain did not exist, when in fact there was a perfectly valid IPv4 A record that, if returned, would have resulted in the host at least making a connection over IPv4.

Because these older DNS resolvers could not handle a AAAA query or response correctly, the IETF issued RFC 4074 “Common Misbehavior Against DNS Queries for IPv6 Addresses”.  Now, hosts issue separate AAAA and A queries and if the AAAA query fails, it is likely that the A query will succeed and the host can connect.

For example, here is a Wireshark packet capture showing that a simple DNS query for www.rmv6tf.org resulted four packets on the network.  The DNS query started with an A record query (packet 74) followed by an A record response (packet 75).  Then an AAAA record query (packet 76) was sent and an AAAA record response (packet 79) was returned.  The AAAA query is expanded in the frame packet decode window.

[!Wireshark Packet Capture](https://blogs.infoblox.com/wp-content/uploads/wireshark-packet-capture.jpg)

Wireshark Packet Capture

In 2011, when World IPv6 Day was approaching, there was significant work performed to improve how hosts operated in dual-protocol environments and recovered from failures of either IP version.  The IETF issued RFC 6555 “Happy Eyeballs”, which outlined a more aggressive algorithm that would provide connection resiliency and make the Internet users/customers/eyeballs happier with their connectivity.  This happy eyeballs technique can be implemented in a  web browser like Chrome, or the algorithm can be implemented in the host OS like with Microsoft Network Connectivity Status Indicator (NCSI) or in Apple iOS or OS X.  Regardless, the outcome is that hosts can operate effectively in dual-protocol environments and can recover and establish IP connections using the version that provides the best end-user experience.

Dangers of ANY Queries
There are other issues with DNS queries for Query Class (QCLASS) ANY besides causing problems for very old DNS resolvers that don’t understand IPv6 AAAA records.  A DNS ANY query can result in a lot of data returned from the authoritative name server.  The DNS server that receives an ANY query will simply respond with all the information it has on the subject including A records, AAAA records, DNSSEC key material, etc.  If a DNS server is acting as an Open DNS Resolver and not restricting who can query it, then it may be participating as an unknowing contributor to a DDoS attack.  These same types of DDoS attacks can take place, not only with DNS, but with NTP, and may leverage insecure IoT devices.

Today, the legitimate uses of an ANY query are almost non-existent, but the nefarious uses of ANY are numerous.  Now there are organizations that want to stop answering ANY queries altogether.  Among these organizations is CloudFlare, one of the largest IPv6-enabled Content Delivery Networks (CDNs).  CDNs are another way that we can circumnavigate the Internet seas.  CloudFlare stopped answering ANY DNS queries over one year ago.  If you send a query for ANY to CloudFlare you will receive back a NotImp (Not Implemented) RCODE.  CloudFlare’s team has also worked on two IETF DNSOP working group drafts on this topic, “DNS Meta-Queries restricted” and “Providing Minimal-Sized Responses to DNS Queries that have QTYPE=ANY”.

Future DNS Improvements
The Internet, DNS servers, host operating systems, service providers and content providers have significantly progressed since RFC 4074 was written to address old IPv4-only resolvers.  Now, few of us worry about misbehaving resolvers, other than the concern that they might be too permissive in allowing DNS DDoS packet amplification.  At this middle-stage of IPv6 adoption, should the DNS behavior be changed again?  Or would making a mid-voyage course correction lead us toward an Internet Bermuda Triangle?

During the recent 2017 North American IPv6 Summit, Dani Grant from CloudFlare (@thedanigrant), gave a presentation about their IPv6 deployment experiences.  She mentioned the non-response to DNS ANY queries described above and mentioned how we may want to optimize DNS queries for IPv6.

Marek Vavrusa (@vavrusam) and Olafur Gudmundsson (@OGudm) from CloudFlare have put forward an IETF draft titled “Providing AAAA records for free with QTYPE=A”.  This proposal eliminates the separate A and AAAA query we use today, and return an AAAA record response along with the A record response.  This would cut the number of queries and responses in half.

Providing both an A record response and AAAA record response could be thought of as a theoretical “AAAAA response”.  Jokingly, the term “Quint-A” was coined by Cody Christman (of Wipro and the RMv6TF), while at the 2017 North American IPv6 Summit.

Research and work continues in this area to explore how DNS meta-CLASSes can be used to carry additional information such as AAAA records responses.  These potential directions may include adding an ADDR meta-query.  This would require changes to servers and hosts and would take years to gain wide-scale adoption.  The intent here is that these changes could  result in continuing to drive higher IPv6 adoption rates and reduce the DNS traffic on networks.

Summary
Just like IPv4, IPv6 will never stop evolving as a network protocol.  Even though we have standards for global Internet behavior, we are constantly seeking out ways to improve IP networking.  Even though IPv6 is now firmly deployed on the Internet and its adoption continues to grow, there is still time to optimize IPv6 behavior.  What might have worked well when we were embarking on the IPv6 voyage may not be the way we want our systems to behave when we move to a predominantly IPv6-only Internet.  Even though IPv6 is a “work in progress”, there is no reason to let this slow down your IPv6 deployment plans.  Full steam ahead! But we will use our rudder to make some subtle course corrections as we cruise onward.
