"""
正点原子串口 IMU 传感器数据上报 — 树莓派端
传感器: 正点原子 ATK-IMU 十轴/六轴串口角度传感器模块
通信: UART 串口 (115200bps)
用法: python3 sensor_client.py

依赖安装:
    pip3 install websocket-client pyserial

===== 给树莓派负责同学 =====
1. 将 IMU 模块通过 USB-TTL 或 GPIO 串口连接到树莓派
2. 确认串口号: ls /dev/ttyUSB* 或 /dev/ttyAMA*
3. 修改下方 SERIAL_PORT 为实际串口号
4. 运行: python3 sensor_client.py
5. 读取到真实传感器数据后自动推送到云服务器

===== 正点原子 IMU 串口协议 =====
帧格式: 0x55 + Type(1B) + Data(NB) + Checksum(1B)
加速度帧: 0x55 0x51 AxL AxH AyL AyH AzL AzH TL TH Sum
    ax = int16(AxH<<8 | AxL) / 32768 * 16g * 9.8 → m/s²
角速度帧: 0x55 0x52 GxL GxH GyL GyH GzL GzH TL TH Sum
角度帧:   0x55 0x53 RollL RollH PitchL PitchH YawL YawH TL TH Sum
"""

import json
import time
import math
import sys
import struct
import threading

# ============ 配置 ============
SERVER_URL = "ws://8.138.129.114:3001/ws"
SERIAL_PORT = "/dev/ttyUSB0"       # 树莓派上串口号，按实际情况修改
SERIAL_BAUD = 115200               # 正点原子 IMU 默认波特率
RECONNECT_INTERVAL = 3             # 断线重连间隔（秒）

# ============ 串口初始化 ============
serial_dev = None

def init_serial():
    """初始化串口连接"""
    global serial_dev
    try:
        import serial
        serial_dev = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=0.5)
        print(f"✅ 串口已打开: {SERIAL_PORT} @ {SERIAL_BAUD}bps")
        return True
    except ImportError:
        print("❌ 请安装 pyserial: pip3 install pyserial")
        sys.exit(1)
    except Exception as e:
        print(f"⚠️ 无法打开串口 {SERIAL_PORT}: {e}")
        return False


def close_serial():
    """关闭串口"""
    global serial_dev
    if serial_dev and serial_dev.is_open:
        serial_dev.close()
        serial_dev = None
        print("串口已关闭")


# ============ 正点原子 IMU 协议解析 ============
# 传感器数据缓存
sensor_data = {
    "ax": 0.0, "ay": 0.0, "az": 0.0,   # 加速度 m/s²
    "total": 0.0,                        # 合加速度
    "gx": 0.0, "gy": 0.0, "gz": 0.0,   # 角速度 °/s
    "roll": 0.0, "pitch": 0.0, "yaw": 0.0,  # 角度 °
    "pressure": 0.0, "altitude": 0.0,   # 气压 Pa / 高度 m
    "temperature": 0.0,                 # 温度 °C
    "has_data": False,                  # 是否收到过数据
}
data_lock = threading.Lock()
data_updated = threading.Event()


def parse_imu_frame(frame):
    """解析单帧 IMU 数据 (0x55 + type + data + sum)"""
    if len(frame) < 3:
        return

    if frame[0] != 0x55:
        return

    frame_type = frame[1]
    data_bytes = frame[2:-1]  # 去掉帧头和校验和
    checksum = frame[-1]

    # 验证校验和（累加和，取低字节）
    calc_sum = sum(frame[0:-1]) & 0xFF
    if calc_sum != checksum:
        return

    try:
        if frame_type == 0x51 and len(data_bytes) >= 6:
            # 加速度: Ax Ay Az (int16), 量程 ±16g
            ax_raw = struct.unpack("<h", bytes(data_bytes[0:2]))[0]
            ay_raw = struct.unpack("<h", bytes(data_bytes[2:4]))[0]
            az_raw = struct.unpack("<h", bytes(data_bytes[4:6]))[0]
            with data_lock:
                sensor_data["ax"] = round(ax_raw / 32768.0 * 16.0 * 9.8, 4)
                sensor_data["ay"] = round(ay_raw / 32768.0 * 16.0 * 9.8, 4)
                sensor_data["az"] = round(az_raw / 32768.0 * 16.0 * 9.8, 4)
                sensor_data["total"] = round(
                    math.sqrt(sensor_data["ax"]**2 + sensor_data["ay"]**2 + sensor_data["az"]**2), 4
                )
                sensor_data["has_data"] = True
            data_updated.set()

        elif frame_type == 0x52 and len(data_bytes) >= 6:
            # 角速度: Gx Gy Gz (int16), 量程 ±2000°/s
            gx_raw = struct.unpack("<h", bytes(data_bytes[0:2]))[0]
            gy_raw = struct.unpack("<h", bytes(data_bytes[2:4]))[0]
            gz_raw = struct.unpack("<h", bytes(data_bytes[4:6]))[0]
            with data_lock:
                sensor_data["gx"] = round(gx_raw / 32768.0 * 2000.0, 4)
                sensor_data["gy"] = round(gy_raw / 32768.0 * 2000.0, 4)
                sensor_data["gz"] = round(gz_raw / 32768.0 * 2000.0, 4)
                sensor_data["has_data"] = True
            data_updated.set()

        elif frame_type == 0x53 and len(data_bytes) >= 6:
            # 角度: Roll Pitch Yaw (int16), 量程 ±180°
            roll_raw = struct.unpack("<h", bytes(data_bytes[0:2]))[0]
            pitch_raw = struct.unpack("<h", bytes(data_bytes[2:4]))[0]
            yaw_raw = struct.unpack("<h", bytes(data_bytes[4:6]))[0]
            with data_lock:
                sensor_data["roll"] = round(roll_raw / 32768.0 * 180.0, 4)
                sensor_data["pitch"] = round(pitch_raw / 32768.0 * 180.0, 4)
                sensor_data["yaw"] = round(yaw_raw / 32768.0 * 180.0, 4)
                sensor_data["has_data"] = True
            data_updated.set()

        elif frame_type == 0x55 and len(data_bytes) >= 8:
            # 气压(4B int32) + 高度(4B int32)
            pressure = struct.unpack("<i", bytes(data_bytes[0:4]))[0]
            altitude = struct.unpack("<i", bytes(data_bytes[4:8]))[0]
            with data_lock:
                sensor_data["pressure"] = float(pressure)
                sensor_data["altitude"] = round(altitude / 100.0, 2)  # cm → m
                sensor_data["has_data"] = True
            data_updated.set()

    except Exception as e:
        pass


def serial_reader_thread():
    """串口读取线程：不断从串口读取字节，拼接帧并解析"""
    buffer = bytearray()
    FRAME_MAX_LEN = 30  # 最长帧长度

    while True:
        if serial_dev is None or not serial_dev.is_open:
            time.sleep(RECONNECT_INTERVAL)
            continue

        try:
            if serial_dev.in_waiting > 0:
                chunk = serial_dev.read(serial_dev.in_waiting)
                buffer.extend(chunk)

                # 从 buffer 中解析帧
                while len(buffer) >= 3:
                    # 找帧头 0x55
                    if buffer[0] != 0x55:
                        # 没找到帧头，丢弃一个字节继续找
                        idx = buffer.find(0x55, 1)
                        if idx > 0:
                            del buffer[:idx]
                        else:
                            buffer.clear()
                        continue

                    # 确定帧类型和长度
                    frame_type = buffer[1]
                    # 各类型帧的数据长度
                    data_lens = {
                        0x50: 0,    # 时间
                        0x51: 6,    # 加速度
                        0x52: 6,    # 角速度
                        0x53: 6,    # 角度
                        0x54: 6,    # 磁场
                        0x55: 8,    # 气压/高度
                        0x56: 8,    # 经纬度
                        0x57: 8,    # 四元数
                    }
                    data_len = data_lens.get(frame_type, 0)
                    frame_len = 3 + data_len  # 0x55 + type + data + sum

                    if frame_len > FRAME_MAX_LEN:
                        del buffer[0]
                        continue

                    if len(buffer) >= frame_len:
                        frame = buffer[:frame_len]
                        parse_imu_frame(frame)
                        del buffer[:frame_len]
                    else:
                        break  # 等更多数据

            else:
                time.sleep(0.001)  # 1ms 轮询

        except Exception as e:
            print(f"⚠️ 串口读取异常: {e}")
            time.sleep(1)


def get_sensor_data():
    """线程安全地获取传感器数据快照"""
    with data_lock:
        return dict(sensor_data)


def main():
    # 初始化串口
    if not init_serial():
        print("持续尝试打开串口...")
        print("提示: 请确认 IMU 模块已连接，串口号正确")
        print(f"当前串口: {SERIAL_PORT}")
        print(f"可用串口: ls /dev/ttyUSB* /dev/ttyAMA* /dev/ttyS*")

    # 启动串口读取线程
    reader = threading.Thread(target=serial_reader_thread, daemon=True)
    reader.start()

    # 导入 WebSocket
    try:
        from websocket import create_connection, WebSocketConnectionClosedException
    except ImportError:
        print("❌ 请安装依赖: pip3 install websocket-client")
        sys.exit(1)

    print(f"目标服务器: {SERVER_URL}")
    print("=" * 50)
    print("等待传感器数据...")
    print("(串口未就绪或传感器未连接时将不会发送任何数据)")
    print("=" * 50)

    ws = None
    last_print_time = 0

    while True:
        try:
            # 确保 WebSocket 连接
            if ws is None:
                try:
                    ws = create_connection(SERVER_URL)
                    print("✅ 已连接到服务器")
                except Exception as e:
                    print(f"⚠️ 服务器连接失败: {e}，{RECONNECT_INTERVAL}秒后重试...")
                    time.sleep(RECONNECT_INTERVAL)
                    continue

            # 等待传感器数据更新
            if data_updated.wait(timeout=0.5):
                data_updated.clear()
                data = get_sensor_data()

                if data["has_data"]:
                    # 构建发送数据
                    payload = {
                        "ax": data["ax"],
                        "ay": data["ay"],
                        "az": data["az"],
                        "total": data["total"],
                        "gx": data["gx"],
                        "gy": data["gy"],
                        "gz": data["gz"],
                        "roll": data["roll"],
                        "pitch": data["pitch"],
                        "yaw": data["yaw"],
                        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    ws.send(json.dumps(payload))

                    # 每 5 秒打印一次状态
                    now = time.time()
                    if now - last_print_time > 5:
                        print(f"📡 total={data['total']:.2f} m/s² | "
                              f"roll={data['roll']:.1f}° pitch={data['pitch']:.1f}° yaw={data['yaw']:.1f}°")
                        last_print_time = now
                else:
                    # 还没收到传感器数据，不发送
                    pass
            else:
                # 超时没有新数据
                if serial_dev is None or not serial_dev.is_open:
                    print("⏳ 串口未就绪，尝试重新打开...")
                    close_serial()
                    init_serial()

        except WebSocketConnectionClosedException:
            print("⚠️ WebSocket 连接断开，重连中...")
            ws = None
            time.sleep(RECONNECT_INTERVAL)
        except (ConnectionRefusedError, OSError, BrokenPipeError) as e:
            print(f"⚠️ 连接异常: {e}")
            ws = None
            time.sleep(RECONNECT_INTERVAL)
        except KeyboardInterrupt:
            print("\n已停止")
            break
        except Exception as e:
            print(f"⚠️ 异常: {type(e).__name__}: {e}")
            ws = None
            time.sleep(1)

    if ws:
        ws.close()
    close_serial()


if __name__ == "__main__":
    main()