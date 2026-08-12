import torch
import torch.nn as nn
from torch.autograd import Function

class GradientReversalLayer(Function):
    @staticmethod
    def forward(ctx, x, lamda):
        ctx.lamda = lamda
        return x.view_as(x)

    @staticmethod
    def backward(ctx, grad_output):
        output = grad_output.neg() * ctx.lamda
        return output, None

class FeatureExtractor(nn.Module):
    def __init__(self, in_channels=1):
        super(FeatureExtractor, self).__init__()
        self.encoder = nn.Sequential(
            nn.Conv1d(in_channels, 16, kernel_size=3, stride=1, padding=1),
            nn.ReLU(),
            nn.MaxPool1d(2, stride=2, padding=0),
            nn.Conv1d(16, 32, kernel_size=3, stride=1, padding=1),
            nn.ReLU(),
            nn.MaxPool1d(2, stride=2, padding=0),
            nn.Conv1d(32, 64, kernel_size=3, stride=1, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(100),
            nn.Flatten()
        )

    def forward(self, x):
        x = self.encoder(x)
        x = x.view(x.size(0), -1)
        return x

class Classifier(nn.Module):
    def __init__(self, in_features=6400, num_classes=4):
        super(Classifier, self).__init__()
        self.predictor = nn.Sequential(
            nn.Linear(in_features, 100),
            nn.ReLU(),
            nn.Linear(100, num_classes)
        )

    def forward(self, x):
        x = self.predictor(x)
        return x

class DomainDiscriminator(nn.Module):
    def __init__(self, in_features=6400):
        super(DomainDiscriminator, self).__init__()
        self.discriminator = nn.Sequential(
            nn.Linear(in_features, 100),
            nn.ReLU(),
            nn.Linear(100, 1),
            nn.Sigmoid()
        )
        
    def forward(self, x, alpha=1.0):
        reversed_input = GradientReversalLayer.apply(x, alpha)
        x = self.discriminator(reversed_input)
        return x