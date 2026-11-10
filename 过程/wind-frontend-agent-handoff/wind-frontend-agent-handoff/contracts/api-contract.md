# 后端API合同

应用监听127.0.0.1:8101，由HTTPS反向代理公开。以下路径相对于应用根；示例部署在外部增加 `/wind-v2` 前缀。所有纳秒时间在JSON响应中使用十进制字符串，避免JavaScript整数精度损失。

## 认证

服务读取 `--credentials` 指定的JSON；值是token的SHA-256小写十六进制摘要，不是明文：

```json
{
  "gateways": {"rpi5": "<该网关token的64位SHA-256摘要>"},
  "read_token_sha256": "<独立读取token的64位SHA-256摘要>"
}
```

各网关及读取token必须不同。文件由操作者准备，不能进入Git或Nix store。HTTP用 `Authorization: Bearer <token>`；网关token只能上传本身份数据/状态，读取token只能访问读取接口。匿名健康检查也返回401。公网必须使用TLS；网关客户端只对localhost/127.0.0.1/::1允许HTTP，不跟随重定向，不关闭证书校验。

WebSocket建立后，客户端必须在5秒内发送首条JSON `{"token":"<读取token>"}`。token不放URL，认证失败以1008关闭。浏览器可直接使用首消息认证，无需把token写进查询参数。

## 路由

| 方法和路径 | 权限与用途 |
| --- | --- |
| `GET /health` | 读取token；返回 `{"ok":true}`，只代表API进程可响应 |
| `GET /openapi.json` | 读取token；机器可读HTTP接口定义 |
| `PUT /api/segments/{segment_id}` | 网关token；上传完整段，ID是请求正文的SHA-256 |
| `POST /api/gateways/{gateway_id}/status` | 对应网关token；更新最新状态和预览 |
| `GET /api/gateways` | 读取token；配置中的网关及最新状态 |
| `GET /api/sessions?gateway_id=rpi5` | 读取token；可选网关筛选，按实验标签汇总 |
| `GET /api/frames` | 读取token；按条件分页读取有效帧 |
| `WS /api/replay` | 首消息认证；连续发送历史页，最后正常关闭 |
| `WS /api/live` | 首消息认证；1 Hz最新状态，不持久积压 |

## 上传与状态

段上传正文为原封不动的 `.wind.zst` 字节，建议 `Content-Type: application/zstd`。不逐帧上传JSON，不传manifest或回执文件。

```json
{"segment_id":"<正文摘要>","stored":true,"created":true}
```

首次成功为201；已存在且内容一致为200、`created:false`。确认仅在文件持久化和SQLite索引提交后返回。断线后重传同一内容ID不会重复计数。ID与正文不符为409；网关身份不符为403；格式错误为400；压缩正文超过8 MiB或解压内容超过16 MiB为413。格式只接受一个完整WIND1 Zstd段，无旧格式分派。

状态POST正文上限64 KiB，至少包含一个 `channels` 对象。例如：

```json
{
  "channels": {
    "usb-if00": {
      "updated_utc_ns":"1790000000000000000",
      "running":true,"frames":800,"segments":0,
      "quality":{"checksum_errors":0,"length_errors":0,"discarded_bytes":0,"incomplete_bytes":0},
      "read_bytes":10800,"queue_bytes":0,"queue_peak_bytes":600,
      "latest":{"utc_ns":"1790000000000000000","monotonic_ns":"1000000000","message_id":3,"raw_hex":"..."}
    }
  },
  "host": {
    "boot_utc_ns": "1789999879750000000",
    "uptime_sec": 120.25,
    "cpu_temp_mc": 45678,
    "disk_used_percent": 25.0,
    "throttled_hex": "0x0",
    "ext5v_v": 5.0652,
    "undervoltage_alarm": false,
    "firmware_sample_utc_ns": "1790000000000000000"
  }
}
```

响应为 `{"accepted":true}`。采集器计数是本次进程累计值，重启后归零；`latest`可能为null。状态文件缺失时upload不虚构该通道。状态不是持久数据，也不是实验质量验收。

`host` 是兼容扩展，旧客户端仍可只发送 `channels`。云端原样保存整个状态对象，包括 `host` 的未知字段、null和纳秒字符串；`GET /api/gateways` 及 `/api/live` 的 `status.host` 返回同一份对象，不改名、不截掉字段。

`uptime_sec`、`cpu_temp_mc`、`disk_used_percent` 每次上报直读；磁盘统计针对网关数据目录所在文件系统。`boot_utc_ns` 为当前UTC时钟减去 `/proc/uptime` 的估计值，使用纳秒字符串避免JavaScript精度损失，但实际精度受uptime采样和时钟同步影响；前端不应把微小变化直接判为重启。任何指标读取失败均为null，不把缺测解释成0。

`throttled_hex` 与 `ext5v_v` 由 `vcgencmd get_throttled` 和 `vcgencmd pmic_read_adc EXT5V_V` 获取。每条命令超时200 ms，两条结果在upload进程内缓存30秒，失败也缓存；过期查询失败会清除旧值。`firmware_sample_utc_ns` 表示最近一次查询尝试的UTC时间，设备缺失也记录尝试时间；两个值均为null时不表示成功采样。缓存最多造成约30秒的读数延迟，不用于捕获毫秒级掉压波形。

`undervoltage_alarm` 独立直读名为 `rpi_volt` 的hwmon节点 `in0_lcrit_alarm`，无邮箱设备时仍可用；缺失为null。它是内核最近轮询窗口的欠压告警，不是电压值，也不冒充 `throttled_hex`。Linux驱动每两秒读取并清除固件粘滞位，因此 `get_throttled` 高位不能在此配置下被解释为完整的“自启动以来”历史。前端可据此显示近期欠压状态，但不能用一次正常读数排除之前发生过掉压。[内核驱动](https://github.com/torvalds/linux/blob/v6.18/drivers/hwmon/raspberrypi-hwmon.c)、[固件命令](https://www.raspberrypi.com/documentation/computers/os.html#vcgencmd)。

网关列表返回 `{"gateways":[{"gateway_id":"rpi5","online":true,"received_utc_ns":"...","status":{...}}]}`。`online`只表示云端在5秒内收到upload状态，不证明采集线程、物理传感器或数据质量正常。应同时查看通道更新时间、最后有效帧时间和质量计数。云端重启后状态为空，等待下一次上报，不从旧状态伪造在线。

## 会话和帧查询

会话列表的每项包含 `gateway_id`、`session_id`、`segments`、`frames`、`start_ns`、`end_ns`及四项质量计数。时间端点为UTC纳秒字符串；纯质量段没有有效帧时端点为null。session只是实验标签，不存在需收尾的生命周期。

| 帧查询参数 | 含义 |
| --- | --- |
| `gateway_id`, `channel_id` | 必填，来源筛选 |
| `session_id` | 可选，精确匹配实验标签 |
| `since_ns`, `until_ns` | 可选，包含端点的UTC纳秒范围，采用有符号64位整数 |
| `message_id` | 可选，十进制0～255；省略时保留所有有效消息 |
| `limit` | 默认100，允许1～1,000 |
| `cursor` | 原样回传上一页的 `next_cursor`，其他筛选条件保持不变 |

```json
{
  "frames":[{
    "segment_id":"<正文摘要>","session_id":"field-v2",
    "utc_ns":"1790000000000000000","monotonic_ns":"1000000000",
    "message_id":3,"raw_hex":"5555030c010002000300040005000600ce",
    "time_basis":"read_return"
  }],
  "next_cursor":"<段ID>:<下一条记录的字节位置>"
}
```

每次最多扫描两个段，解压后跳过不匹配的已对齐记录。即使 `frames` 为空，也必须继续跟随非null游标；只有null代表当前查询结束。游标没有文件路径或签名，也不冻结数据库快照；后来补传、排在游标之前的段，需要从头发起新查询才能看到。

排序按段的UTC最小值和内容ID，再按段内原记录顺序。UTC回拨不会改写数据；不承诺把跨段回拨数据重新排列成传感器采样顺序。原始整数和完整帧保持原样，未知量程不转换为物理单位。

`/api/replay`接受同样的筛选与分页参数。认证后连续发送 `{"type":"frames",...页响应...}`；不模拟设备的实时采样节奏，由客户端依据时间戳控制播放。最后一页游标为null，连接以1000关闭。发送使用网络背压，不预读全部历史。

`/api/live`每秒发送 `{"type":"status","gateways":[...]}`。慢客户端恢复发送时读取最新快照，不积压中间预览。它不提供全采样率直播或可靠重放；完整有效数据只能从持久段查询。WebSocket输入消息上限64 KiB、接收队列1条；首消息认证后不需要继续发送控制消息。

## CSV与协议库

```sh
wind-export --output samples.csv one.wind.zst two.wind.zst
wind-export --message-id 3 --output - one.wind.zst
```

输出文件必须不存在，`-`写标准输出。列为来源/实验标签、`time_basis`、双时钟、消息ID、完整帧hex和六轴原始整数。非六轴消息的轴值留空，不丢弃其帧。按参数给定的文件顺序导出，不重采样、不插值。

协议库入口为 `Parser`、`SegmentBuilder`、`load_segment`。解析器计数累计，持续采集应把相邻封口边界的计数差写入各段；轮转时不能调用 `Parser.finish()`。`Segment.validate()`只用于导入/网络接收边界，查询不重新同步扫描或核验整个目录。
