# 中大珠海校区：地标图像解读

坐标统一为 1960 × 1248 缩图像素；左上为原点，x 向右、y 向下，北朝上。原图为 9917 × 6315。

原图坐标换算：originalX = cx × 9917/1960；originalY = cy × 6315/1248。标注中心通常约有 ±5 px 视觉误差；建筑群范围与湖泊范围不是精确测绘轮廓。

## 关键 15 点

| 地标 | cx | cy | 图面状态 |
|---|---:|---:|---|
| 图书馆 | 1266 | 500 | planned_in_2024_map |
| 教学楼长轴 | 1276 | 686 | shown_in_2024_map_status_unspecified |
| 博物馆 | 1274 | 870 | planned_in_2024_map |
| 行政楼（图书馆） | 1286 | 933 | shown_in_2024_map_status_unspecified |
| 音乐厅 | 1198 | 819 | under_construction_in_2024_map |
| 海琴1号 | 1600 | 640 | shown_in_2024_map_status_unspecified |
| 海琴2号 | 1574 | 695 | shown_in_2024_map_status_unspecified |
| 海琴3号 | 1541 | 791 | shown_in_2024_map_status_unspecified |
| 海琴4号 | 1528 | 881 | shown_in_2024_map_status_unspecified |
| 海琴5号 | 1513 | 976 | shown_in_2024_map_status_unspecified |
| 海琴6号 | 1412 | 1080 | shown_in_2024_map_status_unspecified |
| 国际交流中心 | 1542 | 1059 | shown_in_2024_map_status_unspecified |
| 体育馆 | 1429 | 621 | shown_in_2024_map_status_unspecified |
| 槿园运动场/田径场 | 1339 | 568 | shown_in_2024_map_status_unspecified |
| 天琴楼 | 634 | 548 | shown_in_2024_map_status_unspecified |


## 形态与状态使用边界

- 俯视图明确标注“2024年3月制”；不是 2026 年竣工状态核验。青色表示“规划在建”，应依各个文字标签区分规划与在建。
- 图书馆和博物馆在俯视图标为规划，音乐厅、瀚林1号、桐园部分组团标为在建。鸟瞰效果图中的完整建筑不能证明其已经建成。
- 行政楼保留原图“行政楼（图书馆）”双重标签；不据此认定当前实际功能。
- roughFloors 全为沙盘示意层数，不是实测高度。图书馆/博物馆用圆筒体，行政楼用 V 形翼楼，教学楼为南北极长条，海琴楼以多庭院组团表达。
- 地形仅能辨认西北山体、绿带及海岸；不得把单一“25M等高线”推广为整座山体高度。
- 湖泊应沿原图形状描边；JSON bbox 只是图像位置范围，不应直接当作矩形湖面。隐湖与若海“规划景观提升”不等于湖泊尚未存在。

## 文件

- landmarks.json：44 个地标；含中心、原图坐标、bbox、形态、示意层数、置信度和状态。
- landmarks-key15-annotated.jpg：关键 15 点目视对照。
- top-down-1960.jpg、aerial-1960.jpg：查看用缩图。
- west-core.jpg、east-core.jpg、north-housing.jpg、legend.jpg：高细节局部。

所有源文件均只读，未修改。
