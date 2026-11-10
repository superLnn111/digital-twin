# 存储与架构

本页定义已经实现的协议和段文件，并明确服务边界。新仓库只接受本页这一种段格式，无旧布局兼容层。

## 数据含义

ATK-IMU901 上传帧为 `55 55 message_id payload_length payload checksum`。校验为前面所有字节的加和模 256，不是 CRC。沿用已验证协议的 payload 最大 64 字节；未知 message ID 和已知 ID 的非典型长度，只要满足帧边界和加和校验就保留，不能凭消息类型静默丢弃。

`Parser.feed(data, utc_ns, monotonic_ns)` 在内存完成同步、校验和噪声丢弃。每次调用只扫描一次输入，以游标推进；不逐帧删除缓冲区前缀。最多保留一个不完整候选帧。完整帧的两个时间戳取自补齐该帧的 read 返回时刻，不从固定采样率推算。串口读入后的排队与写盘不能改变这个时刻。

切段不调用 `Parser.finish()`。未完成帧留在解析器内存，收到剩余字节后才归入下一段。真正结束输入时，`finish()` 只统计剩余字节，不保存其内容。各段不含前缀上下文，不依赖相邻文件才能读取。

物理量范围未经实测确认时，API 只提供原始整数。`six_axis` 返回 ax/ay/az/gx/gy/gz，不假定 g 或 dps 量程。寄存器工具只生成读取命令，不写配置，也不访问串口。

## 单一文件格式

文件名后缀为 `.wind.zst`，完整内容是一个标准 Zstd 1 档、带内容校验、无外部字典的压缩帧。解压后的字节顺序：

1. 八字节魔数：`WIND1\r\n\x1a`。
2. 四字节小端无符号整数：UTF-8 JSON 段头长度。
3. 指定长度的 JSON 段头。
4. 零个或多个连续记录；每条为 `<qQ` 两个固定宽度时钟，再接一个完整厂商帧。`q` 是 Unix UTC 纳秒，`Q` 是单调时钟纳秒。厂商帧自身的 payload_length 决定记录结束位置，无第二套变长编码。

段头字段：

| 字段 | 含义 |
| --- | --- |
| `gateway_id`, `channel_id`, `session_id` | 来源和实验标签；session 不是需收尾的状态机 |
| `time_basis` | `read_return` 或历史记录的 `legacy_frame_acceptance`；两者共享同一个文件格式 |
| `frame_count`, `valid_bytes` | 有效帧数量及完整厂商帧字节总量 |
| `start_utc_ns`, `end_utc_ns` | 段内 UTC 最小值与最大值，允许墙上时钟回拨 |
| `start_monotonic_ns`, `end_monotonic_ns` | 首末帧单调时钟；重置后必须另起段 |
| `quality` | `checksum_errors`, `length_errors`, `discarded_bytes`, `incomplete_bytes` 四个非负计数 |

`checksum_errors` 统计同步扫描遇到的失败候选，不是设备缺样数；一次链路损坏可能产生多个候选错误。`discarded_bytes` 是同步时跳过的字节；`incomplete_bytes` 只在真正结束输入时计数，不把跨 read 的正常半帧当丢失。零帧段可以保存纯质量信息，四个时钟端点均为 JSON null。

`SegmentBuilder` 在内存中保存紧凑的时钟和有效帧记录；封口时才生成包含最终统计的段头并用标准 Zstd 压缩。它不生成 raw/idx/commit/receipt/manifest 副本。约60秒数据对应一个内存段，capture按单调时钟在完整帧边界轮转；无新输入时也会封口已有完整帧，半帧继续留在解析器内存。

读取端用固定时钟头和厂商长度字段遍历已对齐记录，不再扫描字节流寻找 `55 55`。`load_segment` 验证压缩流；`Segment.validate()` 在迁移或上传接收边界检查一次帧校验和段头一致性，不放进每次查询的路径。

## 文件发布和失败边界

`publish_segment` 要求父目录已存在，每个调用者独占一个唯一段名。它拒绝已有正式文件或同名 `.tmp`，不覆盖已有记录。顺序为独占创建 `.tmp`、写入压缩内容、同步文件、原子改名、同步父目录。失败不清理残留。

upload只枚举正式 `.wind.zst`；`.tmp` 原地忽略，不参与启动恢复和上传。崩溃可能丢失整个未封口段及内存队列，正常负载下当前段窗口约 60 秒，I/O 阻塞时总丢失窗口可能更大。已封口段和当前段的保证不得混淆；本库不声称能修复供电或介质故障。

部署目录和权限由 Nix/systemd 声明，不由 Python 自动创建或修补。每通道一个 `wind-capture@.service`，队列每路 1 MiB；单路不可恢复错误退出，由 systemd 管理设备生命周期与重启退避。upload 独立运行，不参与采集封口。通用模块默认关闭自动淘汰，Pi显式开启；旧数据目录不进入新服务的删除范围。

## 历史导出

旧格式只由仓库外一次性工具读取。有效帧来自旧原文及冻结的旧解析器，时间来自旧接收索引或 JSONL；转换核对有效帧顺序/字节、UTC 与单调时钟、质量计数。原有微秒精度精确转成整数纳秒，不经浮点时间，也不把旧解析时刻改写为 read 返回时刻。

噪声字节不会写入新段。迁移时把一个有效帧之前累计的质量计数归入包含该帧的段，最终不完整尾部归入最后一段。这只定义计数归属，不推算噪声发生时间。原来源的消息分布、完整周期计数及源状态保存在仓库外的核对报告中，不假装未完成历史会话已经正常结束。

迁移结果通过新库重新读取，逐通道核对有效帧和时钟流摘要、总帧数及段头质量计数总和。转换前后检查源文件未变化。旧源文件保持原样；转换产物与失败残留也不自动删除。

## 云端边界

云端仅以段为上传和索引单位。接收完成哈希检查、文件持久化、SQLite 索引提交之后才确认上传。重传补齐同一对象的索引，不做全目录恢复核验。查询使用 SQLite 定位少量段，解压后跳过无关的已对齐记录，不解码整个历史会话。实时预览是独立的 1 Hz latest-only 非持久通道，不替代历史段。


SQLite仅保存段级元数据。先同步文件及目录，再提交索引，最后返回HTTP确认；崩溃若发生在文件发布与索引提交之间，客户端重传时只核对该已知对象并补登记，不在启动时遍历目录。正常重复上传不重写文件。索引已登记的不可变对象不在每次查询时重复计算SHA-256；标准Zstd仍检查压缩流内容校验。

段ID是压缩文件的SHA-256。云端文件位于 `segments/<digest>.wind.zst`，索引为 `index.sqlite3`。查询按段索引定位，直接解码对齐记录；游标为段ID和下一条记录的字节位置。一次最多扫描两个段，零匹配页仍可有后续游标。没有布局免检证书、后台全量核验或多版本适配。

## 网关配置和目录

配置由Nix的TOML生成器落盘。下面展示等价的CLI配置结构，不含凭据：

```toml
gateway_id = "rpi5"
session_id = "field-v2"
data_dir = "/var/lib/wind-monitoring"
status_dir = "/run/wind-monitoring"
cloud_url = "https://server.example/wind-v2"
# 通用模块不设置淘汰阈值；Pi的显式配置见 deployment/nixos/rpi5.nix。

[channels.usb-if00]
device = "/dev/serial/by-id/usb-wch.cn_USB_Quad_Serial_0123456789-if00"
baudrate = 115200
```

每个通道目录为 `data_dir/<channel>/`，其中只有完整段和可能留下的 `.tmp`。`uploads.sqlite3`只记录目的地址与文件的云端确认，不承担采集提交或会话生命周期。修改目的地址后重新上传，不能沿用旧服务器的确认。

upload用 `glob("*.wind.zst")` 枚举配置通道，空目录或尚未创建的通道目录不阻塞上传。先按相对路径排除当前目的地址已确认的段，再对未确认段各读取一次 `mtime_ns`，按该值跨通道排序上传，并将同一值写入确认记录。目录枚举和确认集合查询仍为O(N)，但已确认历史段不再参与逐文件stat、读取或排序。

capture只持有一条串口，使用pyserial原生独占打开。读取线程每次最多读4096字节，超时50 ms，在read返回后立即记录双时钟。原始字节队列预算为1 MiB，不是整个进程的RSS限制。写线程顺序同步、校验、组段；队列满、串口断开或不可恢复I/O错误直接退出，不自动重开设备，也不抢救未提交段。

状态位于 `status_dir/<channel>.json`，每秒原子替换，是可丢失的运行快照，不是数据提交凭证。upload用独立线程上报最新状态，慢上传不阻塞capture。HTTP请求超时15秒；暂时网络/服务端错误保留段后重试，鉴权及其他4xx失败直接退出交由systemd处理。不会跟随重定向或绕过TLS错误。

只有显式同时设置 `0 < prune_low_percent < prune_high_percent < 100` 才会启用淘汰。Pi在 `deployment/nixos/rpi5.nix` 设置高水位80%、低水位65%；通用模块本身仍不设置阈值。到达数据目录所在文件系统整体高水位后，按 `uploads.sqlite3` 记录的mtime由旧到新删除本目的地址已确认的段，直至低水位或没有可删项。只接受配置通道下的正式段路径；绝不删除未确认段、`.tmp`或其它目录。若空间主要由其它数据占用，仅回收本服务文件不一定能达到低水位；不会继续删除别处数据。

## 部署和验证边界

NixOS原生StateDirectory/tmpfiles创建新数据及运行目录，LoadCredential传入凭据；没有ExecStartPre自检/修复脚本。四路采集没有相互启停依赖。cloud以单个Uvicorn进程运行，实时状态只保存在内存，慢客户端使用传输背压而非应用积压队列。

采集保留 `wind-capture@` 模板和 `StateDirectory=wind-monitoring/%i`。各实例通过drop-in将 `BindsTo`、`After`、`wantedBy` 绑定到配置串口路径派生的 `.device`，不再挂入 `multi-user.target.wants`。设备出现时拉起、拔出时停止、重插后恢复；设备缺席期间不轮询或反复启动Python。设备在线但采集失败时，`Restart=on-failure` 从1秒经5步指数退避至30秒；`StartLimitIntervalSec=0` 保留持续重试能力。`TimeoutStopSec=800ms` 不变，超时仍可丢失未封口数据。

上述绑定要求设备经udev带 `systemd` 标签暴露给systemd；USB tty已有上游规则。仅有 `/dev/...` 路径并不足够，普通PTY及未暴露为活跃设备单元的 `/dev/null` 不适用；合成测试直接运行CLI，不为它们增加生产回退机制。首次切换时，已活跃设备不会仅因新增Wants关系重新触发启动，操作者须核验实例状态。

新服务目录与旧 `/var/lib/wind-gateway`、`/var/lib/wind-cloud-staging` 分离。旧SSH密码、公钥、FRP路径保持；普通成员的只读sudo命令改为新通道状态和服务日志，没有遗留processor引用。角色权限不随重构扩大。

本地验证使用四路PTY、测试专用fsync故障注入和真实进程SIGKILL，不修改生产代码来模拟故障。历史联调只读第二阶段导出，复制到全新目录，检查上传、重启、全部HTTP分页、WebSocket、CSV及预览。真实Pi的ARM构建、物理USB、供电和生产切换由现场另行验收，不以控制端结果冒充。
