import os
import matplotlib.pyplot as plt
import pandas as pd
from train import train_dann

# ====================== 配置区（只需要修改这里）======================
# 要测试的alpha值列表（按从小到大排列）
ALPHA_VALUES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
# 每个alpha训练的轮次
EPOCHS_PER_RUN = 100
# ===================================================================

# 全局配置
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['figure.dpi'] = 300

def main():
    print("="*60)
    print("🚀 DANN自动alpha调参脚本启动")
    print(f"📋 测试的alpha值: {ALPHA_VALUES}")
    print(f"⏱️  每个alpha训练轮次: {EPOCHS_PER_RUN}")
    print("="*60)
    
    results = []
    best_acc = 0.0
    best_alpha = 0.0
    best_result_dir = ""
    
    # 逐个测试每个alpha
    for alpha in ALPHA_VALUES:
        print(f"\n🔥 开始测试 alpha={alpha:.2f}")
        acc, result_dir = train_dann(alpha=alpha, epochs=EPOCHS_PER_RUN)
        results.append({'alpha': alpha, 'best_target_acc': acc, 'result_dir': result_dir})
        
        if acc > best_acc:
            best_acc = acc
            best_alpha = alpha
            best_result_dir = result_dir
    
    # 汇总结果
    print("\n" + "="*60)
    print("🎉 所有alpha测试完成！")
    print(f"🏆 最佳alpha: {best_alpha:.2f}")
    print(f"🎯 最佳目标域准确率: {best_acc:.4f}")
    print(f"📁 最佳结果目录: {best_result_dir}")
    print("="*60)
    
    # 保存结果表格
    df = pd.DataFrame(results)
    df.to_csv('./alpha_tuning_results.csv', index=False)
    print("\n📊 详细结果已保存到: alpha_tuning_results.csv")
    
    # 生成对比图表
    plt.figure(figsize=(10, 6))
    plt.plot(df['alpha'], df['best_target_acc'], marker='o', linewidth=2.5, color='#1f77b4')
    plt.scatter(best_alpha, best_acc, color='#d62728', s=150, zorder=5, edgecolor='white', linewidth=2)
    plt.annotate(f'最佳: alpha={best_alpha:.2f}\n准确率={best_acc:.2%}', 
                 xy=(best_alpha, best_acc), 
                 xytext=(best_alpha+0.1, best_acc-0.05),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1.5),
                 fontweight='bold')
    
    plt.xlabel('域损失权重 alpha', fontweight='bold', fontsize=12)
    plt.ylabel('目标域最佳准确率', fontweight='bold', fontsize=12)
    plt.title('不同alpha值下DANN模型性能对比', fontsize=14, fontweight='bold', pad=20)
    plt.grid(True, linestyle='--', alpha=0.7)
    plt.tight_layout()
    plt.savefig('./alpha_tuning_curve.png', bbox_inches='tight')
    print("📈 性能对比曲线已保存到: alpha_tuning_curve.png")
    
    print("\n✅ 调参完成！你可以使用最佳alpha值进行最终训练了。")

if __name__ == "__main__":
    main()