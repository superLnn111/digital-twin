import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import seaborn as sns
from sklearn.metrics import confusion_matrix, classification_report
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler
import os
from datetime import datetime  # 新增：用于实时时间

# ====================== 自动配置区（无需手动修改）======================
def get_latest_result_dir(root_dir='./results'):
    """自动找到并返回./results下最新创建的训练结果文件夹"""
    if not os.path.exists(root_dir):
        os.makedirs(root_dir)
        raise Exception("❌ 未找到任何训练结果，请先运行 python train.py")
    
    # 列出所有子文件夹并按修改时间降序排序
    subdirs = [os.path.join(root_dir, d) for d in os.listdir(root_dir) 
               if os.path.isdir(os.path.join(root_dir, d))]
    if not subdirs:
        raise Exception("❌ 未找到任何训练结果，请先运行 python train.py")
    
    latest_dir = max(subdirs, key=os.path.getmtime)
    return latest_dir

# 自动加载最新训练结果（再也不用手动改路径了）
RESULT_DIR = get_latest_result_dir()
CLASS_NAMES = ['叶片裂纹', '正常', , '异物，挂冰'，轴承]
# ===================================================================

# 全局学术风格配置（完全保留你原来的设置）
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['figure.dpi'] = 300
plt.rcParams['font.size'] = 11
plt.rcParams['axes.linewidth'] = 1.2
plt.rcParams['grid.alpha'] = 0.3

# 创建图表保存目录
fig_dir = os.path.join(RESULT_DIR, "figures")
os.makedirs(fig_dir, exist_ok=True)

# 获取实时时间（用于图表标题）
train_time = datetime.fromtimestamp(os.path.getmtime(RESULT_DIR)).strftime("%Y-%m-%d %H:%M:%S")
generate_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def plot_advanced_training_curves():
    """高级训练曲线：双轴图+渐变填充+最佳点标注"""
    df = pd.read_csv(os.path.join(RESULT_DIR, "train_log.csv"))
    
    fig, ax1 = plt.subplots(figsize=(10, 6))
    
    # 绘制损失曲线（左轴）
    ax1.plot(df['epoch'], df['train_loss'], color='#1f77b4', linewidth=2.5, label='训练总损失')
    ax1.fill_between(df['epoch'], df['train_loss'], alpha=0.15, color='#1f77b4')
    ax1.plot(df['epoch'], df['val_loss'], color='#d62728', linewidth=2.5, label='验证总损失')
    ax1.fill_between(df['epoch'], df['val_loss'], alpha=0.15, color='#d62728')
    
    ax1.set_xlabel('训练轮次 (Epoch)', fontweight='bold')
    ax1.set_ylabel('损失值 (Loss)', fontweight='bold', color='#1f77b4')
    ax1.tick_params(axis='y', labelcolor='#1f77b4')
    ax1.legend(loc='upper left')
    
    # 绘制准确率曲线（右轴）
    ax2 = ax1.twinx()
    ax2.plot(df['epoch'], df['target_acc'], color='#2ca02c', linewidth=2.5, label='目标域准确率')
    ax2.fill_between(df['epoch'], df['target_acc'], alpha=0.15, color='#2ca02c')
    
    # 标注最高准确率点
    best_acc = df['target_acc'].max()
    best_epoch = df['target_acc'].idxmax() + 1
    ax2.scatter(best_epoch, best_acc, color='#2ca02c', s=100, zorder=5, edgecolor='white', linewidth=1.5)
    ax2.annotate(f'最高: {best_acc:.2%}', 
                 xy=(best_epoch, best_acc), 
                 xytext=(best_epoch+3, best_acc-0.05),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1.5),
                 fontweight='bold')
    
    ax2.set_ylabel('准确率 (Accuracy)', fontweight='bold', color='#2ca02c')
    ax2.tick_params(axis='y', labelcolor='#2ca02c')
    ax2.set_ylim(0, 1.05)
    ax2.legend(loc='upper right')
    
    # 新增：带实时时间的标题
    plt.title(f'DANN模型训练过程曲线\n训练时间: {train_time} | 生成时间: {generate_time}', 
              fontsize=14, fontweight='bold', pad=20)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'training_curves_advanced.png'), bbox_inches='tight')
    plt.close()
    print("✓ 高级训练曲线已生成")

def plot_confusion_matrix_advanced():
    """高级混淆矩阵：带百分比标注+渐变颜色+分类报告"""
    # 自动加载训练生成的预测结果
    y_true = np.load(os.path.join(RESULT_DIR, 'target_labels.npy'))
    y_pred = np.load(os.path.join(RESULT_DIR, 'target_predictions.npy'))
    
    cm = confusion_matrix(y_true, y_pred)
    cm_normalized = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis]
    accuracy = np.sum(y_true == y_pred) / len(y_true)
    
    plt.figure(figsize=(9, 7))
    sns.heatmap(cm_normalized, annot=True, fmt='.2%', cmap='Blues',
                xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES,
                annot_kws={"size": 12, "weight": "bold"},
                cbar_kws={"shrink": 0.8})
    
    plt.xlabel('预测故障类别', fontweight='bold', fontsize=12)
    plt.ylabel('真实故障类别', fontweight='bold', fontsize=12)
    # 新增：带实时时间和准确率的标题
    plt.title(f'目标域故障诊断混淆矩阵\n整体准确率: {accuracy:.2%} | 生成时间: {generate_time}', 
              fontsize=14, fontweight='bold', pad=20)
    plt.xticks(rotation=45, ha='right')
    plt.yticks(rotation=0)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'confusion_matrix_advanced.png'), bbox_inches='tight')
    plt.close()
    print("✓ 高级混淆矩阵已生成")

def plot_tsne_domain_alignment():
    """DANN核心亮点：域对齐t-SNE图（修复sklearn版本兼容性）"""
    source_features = np.load(os.path.join(RESULT_DIR, 'source_features.npy'))
    target_features = np.load(os.path.join(RESULT_DIR, 'target_features.npy'))
    source_labels = np.load(os.path.join(RESULT_DIR, 'source_labels.npy'))
    target_labels = np.load(os.path.join(RESULT_DIR, 'target_labels.npy'))
    
    all_features = np.concatenate([source_features, target_features])
    scaler = StandardScaler()
    all_features_scaled = scaler.fit_transform(all_features)
    
    print("正在进行t-SNE降维，这可能需要1-2分钟...")
    tsne = TSNE(n_components=2, perplexity=40, learning_rate=300, max_iter=2000, random_state=42)
    features_2d = tsne.fit_transform(all_features_scaled)
    
    source_2d = features_2d[:len(source_features)]
    target_2d = features_2d[len(source_features):]
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 7))
    
    # 左图：域分布对比
    ax1.scatter(source_2d[:, 0], source_2d[:, 1], 
                c='#1f77b4', label='源域 (实验室数据)', 
                alpha=0.7, s=30, edgecolor='white', linewidth=0.5)
    ax1.scatter(target_2d[:, 0], target_2d[:, 1], 
                c='#ff7f0e', label='目标域 (现场数据)', 
                alpha=0.7, s=30, edgecolor='white', linewidth=0.5)
    
    ax1.set_title('DANN域自适应特征对齐效果', fontsize=14, fontweight='bold', pad=15)
    ax1.legend(fontsize=12, markerscale=2)
    ax1.axis('off')
    
    # 右图：故障类别分布
    all_labels = np.concatenate([source_labels, target_labels])
    scatter = ax2.scatter(features_2d[:, 0], features_2d[:, 1], 
                          c=all_labels, cmap='tab10', 
                          alpha=0.7, s=30, edgecolor='white', linewidth=0.5)
    
    ax2.set_title('特征空间故障类别分布', fontsize=14, fontweight='bold', pad=15)
    ax2.axis('off')
    
    handles, _ = scatter.legend_elements(prop="colors", alpha=0.7)
    ax2.legend(handles, CLASS_NAMES, bbox_to_anchor=(1.02, 1), loc='upper left', fontsize=11)
    
    # 新增：带实时时间的总标题
    plt.suptitle(f'DANN域自适应特征可视化\n训练时间: {train_time} | 生成时间: {generate_time}', 
                 fontsize=16, fontweight='bold', y=0.98)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'tsne_domain_alignment.png'), bbox_inches='tight')
    plt.close()
    print("✓ t-SNE域对齐图已生成")

def plot_method_comparison_advanced():
    """高级方法对比柱状图"""
    # 请将这里替换为你实际的实验结果
    methods = ['纯分类器(α=0)', 'DANN(α=0.1)', 'DANN(α=0.5)']
    accuracies = [92.3, 31.8, 30.7]  # 用你自己的调参结果替换
    colors = ['#2ecc71', '#f39c12', '#e74c3c']
    
    plt.figure(figsize=(9, 6))
    bars = plt.bar(methods, accuracies, color=colors, width=0.6, edgecolor='black', linewidth=1)
    
    for bar, acc in zip(bars, accuracies):
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + 1,
                f'{acc:.1f}%', ha='center', va='bottom', 
                fontweight='bold', fontsize=12)
    
    plt.ylabel('目标域诊断准确率 (%)', fontweight='bold', fontsize=12)
    # 新增：带实时时间的标题
    plt.title(f'不同α值下DANN模型性能对比\n生成时间: {generate_time}', 
              fontsize=14, fontweight='bold', pad=20)
    plt.ylim(0, 100)
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'method_comparison_advanced.png'), bbox_inches='tight')
    plt.close()
    print("✓ 方法对比柱状图已生成")

if __name__ == "__main__":
    print("="*60)
    print("🚀 高级可视化脚本启动")
    print(f"✅ 自动加载最新训练结果: {RESULT_DIR}")
    print(f"🕒 训练完成时间: {train_time}")
    print(f"🕒 图表生成时间: {generate_time}")
    print("="*60)
    print("开始生成所有高级可视化图表...\n")
    
    plot_advanced_training_curves()
    plot_confusion_matrix_advanced()
    plot_tsne_domain_alignment()
    plot_method_comparison_advanced()
    
    print(f"\n🎉 所有图表已成功生成！")
    print(f"📁 图表保存位置: {fig_dir}")
   