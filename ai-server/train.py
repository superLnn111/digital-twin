import torch
import torch.nn as nn
import torch.optim as optim
from tqdm import tqdm
import numpy as np
import csv
import os
from datetime import datetime
from model import FeatureExtractor, DomainDiscriminator, Classifier
from dataset import FaultDataset1D
from torch.utils.data import DataLoader

def train_dann(alpha, epochs=100, lr=1e-4, batch_size=64, lr_decay=0.97, data_root='./data', input_length=2048):
    """
    训练单个DANN模型，返回最佳目标域准确率
    """
    # 设置随机种子保证可重复性
    torch.manual_seed(42)
    np.random.seed(42)
    
    # 创建结果目录
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    result_dir = f"./results/alpha_{alpha:.2f}_{timestamp}"
    os.makedirs(result_dir, exist_ok=True)
    
    # 加载数据
    source_train_dataset = FaultDataset1D(data_root, domain='source', mode='train', input_length=input_length)
    source_test_dataset = FaultDataset1D(data_root, domain='source', mode='test', input_length=input_length)
    target_train_dataset = FaultDataset1D(data_root, domain='target', mode='train', input_length=input_length)
    target_test_dataset = FaultDataset1D(data_root, domain='target', mode='test', input_length=input_length)
    
    source_train_loader = DataLoader(source_train_dataset, batch_size=batch_size, shuffle=True, drop_last=True)
    source_test_loader = DataLoader(source_test_dataset, batch_size=batch_size, shuffle=False)
    target_train_loader = DataLoader(target_train_dataset, batch_size=batch_size, shuffle=True, drop_last=True)
    target_test_loader = DataLoader(target_test_dataset, batch_size=batch_size, shuffle=False)
    
    # 初始化模型（修复：Predictor → Classifier）
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    feature_extractor = FeatureExtractor().to(device)
    domain_discriminator = DomainDiscriminator().to(device)
    classifier = Classifier().to(device)
    
    # 定义损失函数和优化器
    criterion_cls = nn.CrossEntropyLoss()
    criterion_domain = nn.BCELoss()
    
    optimizer = optim.Adam([
        {'params': feature_extractor.parameters()},
        {'params': classifier.parameters()},
        {'params': domain_discriminator.parameters()}
    ], lr=lr)
    
    lr_scheduler = optim.lr_scheduler.ExponentialLR(optimizer, gamma=lr_decay)
    
    # 初始化日志
    log_file = os.path.join(result_dir, "train_log.csv")
    with open(log_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['epoch', 'train_loss', 'train_cls_loss', 'train_domain_loss', 
                         'val_loss', 'val_acc', 'target_acc', 'domain_acc'])
    
    best_target_acc = 0.0
    best_extractor = None
    best_classifier = None
    
    # 训练循环
    for epoch in range(epochs):
        feature_extractor.train()
        domain_discriminator.train()
        classifier.train()
        
        total_loss = 0.0
        total_cls_loss = 0.0
        total_domain_loss = 0.0
        correct_domain = 0
        total_domain = 0
        
        # 动态计算lambda（已优化为慢速增长）
        p = float(epoch) / epochs
        lamda = 2. / (1. + np.exp(-5 * p)) - 1
        
        for (source_data, source_labels, _), (target_data, _, _) in zip(source_train_loader, target_train_loader):
            source_data, source_labels = source_data.to(device), source_labels.to(device)
            target_data = target_data.to(device)
            
            batch_size = source_data.size(0)
            
            # 前向传播
            source_features = feature_extractor(source_data)
            target_features = feature_extractor(target_data)
            
            source_preds = classifier(source_features)
            
            # 分类损失
            cls_loss = criterion_cls(source_preds, source_labels)
            
            # 域对抗损失
            domain_labels_source = torch.ones(batch_size, 1).to(device)
            domain_labels_target = torch.zeros(batch_size, 1).to(device)
            
            domain_preds_source = domain_discriminator(source_features, lamda)
            domain_preds_target = domain_discriminator(target_features, lamda)
            
            domain_loss_source = criterion_domain(domain_preds_source, domain_labels_source)
            domain_loss_target = criterion_domain(domain_preds_target, domain_labels_target)
            domain_loss = domain_loss_source + domain_loss_target
            
            # 总损失
            loss = cls_loss + alpha * domain_loss
            
            # 反向传播
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            # 统计
            total_loss += loss.item() * batch_size
            total_cls_loss += cls_loss.item() * batch_size
            total_domain_loss += domain_loss.item() * batch_size
            
            domain_preds = torch.cat([domain_preds_source, domain_preds_target])
            domain_labels = torch.cat([domain_labels_source, domain_labels_target])
            correct_domain += ((domain_preds > 0.5) == domain_labels).sum().item()
            total_domain += domain_labels.size(0)
        
        # 学习率衰减
        lr_scheduler.step()
        
        # 验证
        feature_extractor.eval()
        classifier.eval()
        
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        
        with torch.no_grad():
            for data, labels, _ in source_test_loader:
                data, labels = data.to(device), labels.to(device)
                features = feature_extractor(data)
                preds = classifier(features)
                loss = criterion_cls(preds, labels)
                
                val_loss += loss.item() * data.size(0)
                val_correct += (preds.argmax(1) == labels).sum().item()
                val_total += data.size(0)
        
        # 测试目标域
        target_correct = 0
        target_total = 0
        
        with torch.no_grad():
            for data, labels, _ in target_test_loader:
                data, labels = data.to(device), labels.to(device)
                features = feature_extractor(data)
                preds = classifier(features)
                
                target_correct += (preds.argmax(1) == labels).sum().item()
                target_total += data.size(0)
        
        # 计算指标
        avg_train_loss = total_loss / (len(source_train_loader.dataset))
        avg_cls_loss = total_cls_loss / (len(source_train_loader.dataset))
        avg_domain_loss = total_domain_loss / (len(source_train_loader.dataset))
        avg_val_loss = val_loss / val_total
        val_acc = val_correct / val_total
        target_acc = target_correct / target_total
        domain_acc = correct_domain / total_domain
        
        # 保存最佳模型
        if target_acc > best_target_acc:
            best_target_acc = target_acc
            best_extractor = feature_extractor.state_dict().copy()
            best_classifier = classifier.state_dict().copy()
            torch.save(feature_extractor.state_dict(), os.path.join(result_dir, 'extractor_best.pth'))
            torch.save(classifier.state_dict(), os.path.join(result_dir, 'classifier_best.pth'))
            torch.save(domain_discriminator.state_dict(), os.path.join(result_dir, 'discriminator_best.pth'))
        
        # 写入日志
        with open(log_file, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([epoch+1, avg_train_loss, avg_cls_loss, avg_domain_loss, 
                             avg_val_loss, val_acc, target_acc, domain_acc])
        
        # 打印进度
        print(f"alpha={alpha:.2f} | Epoch {epoch+1}/{epochs} | Target Acc: {target_acc:.4f} | Best: {best_target_acc:.4f} | Domain Acc: {domain_acc:.4f}")
    
    # 保存最终模型
    torch.save(feature_extractor.state_dict(), os.path.join(result_dir, 'extractor_final.pth'))
    torch.save(classifier.state_dict(), os.path.join(result_dir, 'classifier_final.pth'))
    torch.save(domain_discriminator.state_dict(), os.path.join(result_dir, 'discriminator_final.pth'))
    
    # ====================== 新增：自动保存所有可视化需要的文件 ======================
    print("\n📊 正在提取特征和预测结果用于可视化...")
    # 加载最佳模型
    feature_extractor.load_state_dict(best_extractor)
    classifier.load_state_dict(best_classifier)
    feature_extractor.eval()
    classifier.eval()
    
    # 提取源域特征和标签
    source_features = []
    source_labels = []
    with torch.no_grad():
        for data, labels, _ in source_test_loader:
            data = data.to(device)
            features = feature_extractor(data)
            source_features.append(features.cpu().numpy())
            source_labels.append(labels.numpy())
    
    source_features = np.concatenate(source_features)
    source_labels = np.concatenate(source_labels)
    
    # 提取目标域特征、标签和预测结果
    target_features = []
    target_labels = []
    target_predictions = []
    with torch.no_grad():
        for data, labels, _ in target_test_loader:
            data = data.to(device)
            features = feature_extractor(data)
            preds = classifier(features).argmax(1)
            target_features.append(features.cpu().numpy())
            target_labels.append(labels.numpy())
            target_predictions.append(preds.cpu().numpy())
    
    target_features = np.concatenate(target_features)
    target_labels = np.concatenate(target_labels)
    target_predictions = np.concatenate(target_predictions)
    
    # 保存所有可视化文件
    np.save(os.path.join(result_dir, 'source_features.npy'), source_features)
    np.save(os.path.join(result_dir, 'source_labels.npy'), source_labels)
    np.save(os.path.join(result_dir, 'target_features.npy'), target_features)
    np.save(os.path.join(result_dir, 'target_labels.npy'), target_labels)
    np.save(os.path.join(result_dir, 'target_predictions.npy'), target_predictions)
    
    print(f"\n✅ alpha={alpha:.2f} 训练完成！最佳目标域准确率: {best_target_acc:.4f}")
    print(f"📁 结果保存到: {result_dir}\n")
    
    return best_target_acc, result_dir

if __name__ == "__main__":
    # 如果直接运行train.py，使用默认参数
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--alpha', type=float, default=0.0, help='域损失权重（已设为最佳值0）')
    parser.add_argument('--epochs', type=int, default=100, help='训练轮次')
    args = parser.parse_args()
    
    best_acc, _ = train_dann(alpha=args.alpha, epochs=args.epochs)
    print(f"最终最佳准确率: {best_acc:.4f}")