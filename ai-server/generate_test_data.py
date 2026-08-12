import numpy as np
import os

# 模拟数据参数
SAMPLE_RATE = 10000  # 采样频率
TOTAL_POINTS = 100000  # 每个类别的总采样点数
NUM_CLASSES = 4  # 4个故障类别

# 创建目录结构
os.makedirs('data/source/train', exist_ok=True)
os.makedirs('data/target/train', exist_ok=True)

# 生成模拟振动信号
def generate_vibration_signal(class_idx, domain='source'):
    """
    生成模拟的风机振动信号
    class_idx: 故障类别（0-3）
    domain: 'source'（低风速）或 'target'（高风速）
    """
    t = np.linspace(0, TOTAL_POINTS/SAMPLE_RATE, TOTAL_POINTS)
    
    # 基础频率（不同故障有不同的特征频率）
    base_freq = 10 + class_idx * 5
    
    # 源域和目标域的频率偏移（模拟风速差异）
    if domain == 'target':
        base_freq *= 1.2  # 高风速下频率更高
    
    # 生成信号：基频 + 谐波 + 噪声
    signal = np.sin(2 * np.pi * base_freq * t)  # 基频
    signal += 0.5 * np.sin(2 * np.pi * 2 * base_freq * t)  # 2次谐波
    signal += 0.3 * np.sin(2 * np.pi * 3 * base_freq * t)  # 3次谐波
    signal += 0.2 * np.random.randn(TOTAL_POINTS)  # 高斯噪声
    
    return signal.astype(np.float32)

# 生成源域数据（低风速）
print("正在生成源域（低风速）数据...")
for i in range(NUM_CLASSES):
    signal = generate_vibration_signal(i, domain='source')
    np.save(f'data/source/train/class_{i}.npy', signal)
    print(f"  已生成: data/source/train/class_{i}.npy, 形状: {signal.shape}")

# 生成目标域数据（高风速）
print("\n正在生成目标域（高风速）数据...")
for i in range(NUM_CLASSES):
    signal = generate_vibration_signal(i, domain='target')
    np.save(f'data/target/train/class_{i}.npy', signal)
    print(f"  已生成: data/target/train/class_{i}.npy, 形状: {signal.shape}")

print("\n✅ 测试数据生成完成！")
print("数据说明：")
print("- 每个文件包含100000个采样点")
print("- 4个故障类别，每个类别有不同的特征频率")
print("- 目标域数据比源域数据频率高20%，模拟风速差异")
print("- 现在可以直接运行 python train.py 进行测试")