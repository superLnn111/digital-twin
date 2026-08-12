import numpy as np
import os

# 自动找到最新的结果目录（和可视化脚本一样）
def get_latest_result_dir(root_dir='./results'):
    subdirs = [os.path.join(root_dir, d) for d in os.listdir(root_dir) 
               if os.path.isdir(os.path.join(root_dir, d))]
    return max(subdirs, key=os.path.getmtime)

RESULT_DIR = get_latest_result_dir()
print(f"✅ 自动加载最新结果: {RESULT_DIR}")

# 加载标签和预测结果
y_true = np.load(os.path.join(RESULT_DIR, 'target_labels.npy'))
y_pred = np.load(os.path.join(RESULT_DIR, 'target_predictions.npy'))

print("\n📊 每个真实类别的预测分布：")
for i in range(4):
    mask = y_true == i
    counts = np.bincount(y_pred[mask], minlength=4)
    print(f"真实类别 {i} → 预测为: {counts}")