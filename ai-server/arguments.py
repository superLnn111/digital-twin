import argparse

def get_args():
    parser = argparse.ArgumentParser(description='DANN for Wind Turbine Fault Diagnosis')
    
    # 训练超参数（已优化）
    parser.add_argument('--epochs', type=int, default=100, help='训练总轮数（从50改成100，给域对齐更多时间）')
    parser.add_argument('--lr', type=float, default=1e-4, help='学习率（1e-4是ResNet的最佳默认值，不用改）')
    parser.add_argument('--batch_size', type=int, default=64, help='批次大小（64刚好，太大容易过拟合）')
    parser.add_argument('--lamda', type=float, default=0.97, help='学习率衰减系数（保持不变，控制学习率缓慢下降）')
    parser.add_argument('--alpha', type=float, default=0.5, help='域损失权重系数（已改成1.0，DANN论文标准值）')
    
    # 数据参数
    parser.add_argument('--data_root', type=str, default='./data', help='数据根目录路径')
    parser.add_argument('--input_length', type=int, default=2048, help='每个样本的采样点长度')
    parser.add_argument('--num_classes', type=int, default=4, help='故障类别总数')
    
    return parser.parse_args()