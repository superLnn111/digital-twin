import os
import numpy as np
import torch
from torch.utils.data import Dataset

class FaultDataset1D(Dataset):
    def __init__(self, data_root, domain, mode='train', input_length=2048, transform=None):
        self.data_root = data_root
        self.domain = domain
        self.mode = mode
        self.input_length = input_length
        self.transform = transform
        
        self.domain_label = 0 if domain == 'source' else 1
        self.data, self.labels = self._load_data()
        
    def _load_data(self):
        data_dir = os.path.join(self.data_root, self.domain, self.mode)
        
        all_data = []
        all_labels = []
        
        for class_file in os.listdir(data_dir):
            if not class_file.endswith('.npy'):
                continue
                
            class_idx = int(class_file.split('_')[1].split('.')[0])
            class_data = np.load(os.path.join(data_dir, class_file))
            
            # Z-score归一化
            class_data = (class_data - np.mean(class_data)) / np.std(class_data)
            
            # 切片成固定长度的样本
            num_samples = len(class_data) // self.input_length
            for i in range(num_samples):
                start = i * self.input_length
                end = start + self.input_length
                sample = class_data[start:end]
                all_data.append(sample)
                all_labels.append(class_idx)
        
        all_data = np.array(all_data, dtype=np.float32)
        all_labels = np.array(all_labels, dtype=np.int64)
        
        return all_data, all_labels
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        data = self.data[idx]
        label = self.labels[idx]
        
        # 增加通道维度
        data = np.expand_dims(data, axis=0)
        
        data = torch.from_numpy(data)
        label = torch.tensor(label, dtype=torch.long)
        domain_label = torch.tensor(self.domain_label, dtype=torch.long)
        
        if self.transform:
            data = self.transform(data)
            
        return data, label, domain_label