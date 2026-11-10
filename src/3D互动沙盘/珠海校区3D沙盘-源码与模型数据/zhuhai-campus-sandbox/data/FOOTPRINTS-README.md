# 珠海校区真实地图足迹

`building-footprints.json` 为四色地图填充区域的描摹结果，不包含随机布置的建筑。最后版本：102个建筑多边形、36个庭院孔洞、7个湖泊区域、2个主要灰色铺装路网。

## 坐标与字段

- `coordinateSystem`：1960×1248地图像素，左上角为(0,0)，x向右、y向下；原图9917×6315。
- `buildings[]`：`id`、`category`、`outer`、`holes`、`centroid`、`bbox`、`areaPx2`、`heightMeters`。
- `outer`、`holes[]` 为开放的 `[x,y]` 环。创建Three.js Shape/Path时闭合，保留洞，不对每个建筑重排位置。
- `bbox` 是[x,y,width,height]。`heightMeters=null`，地图没有建筑高度；3D高度须明确作为示意设定。
- 类别为`dormitory`宿舍54、`teaching_research_office`教学科研办公27、`public_support`配套10、`planned_construction`规划在建11。
- 两个色块在修复自触拓扑后拆成实际独立部分，新增ID `B059-2`、`B074-2`；其余ID稳定。`parentContourId`保留追踪关系。这是拆分原图真实色块，不是补造楼块。
- `lakes[]` 是淡蓝湖面；被桥分开的连续湖体可有多个水面多边形。
- `roads[]` 是中性灰色主要连通铺装区域，保留岛屿孔洞；不是测量道路中心线。`roads-mask.png`同一坐标尺寸，白=铺装、黑=透明背景，可直接作alpha纹理。
- 圆形足迹`B100`的图面文字是“图书馆（规划）”，中心约(1266,500)，bbox为[1237.5,470.5,58.5,58.5]。标记`special_landmark:library`，供App定制圆形图书馆；不是游泳池。该原轮廓原样补回，其它101个足迹、ID、道路和湖面几何未改。
- `excluded[]` 当前为空。餐厅、博物馆、图书馆等规划圆形建筑均保留。

## QA和可复现

`building-footprints-overlay.png`为全图叠加：黑色建筑轮廓、青色庭院孔洞边、蓝色湖岸；圆形图书馆已纳入并标B100。`qa-dorms-courtyards.png`和`qa-east-buildings.png`为放大图。`roads-overlay.png`显示道路提取覆盖范围。

`footprint-validation.json`检查环的面积、点坐标、重复顶点、自交、平面多边形有效性、孔洞包含关系和地图边界。当前无问题。

提取脚本`extract_footprints.py`使用PIL、NumPy和任务本地`deps/`中的OpenCV、Shapely。黑色名称标签造成的小孔被填回，绿化/浅色开放庭院保留；修复个别亚像素自触毛刺后再导出。约1地图像素的描摹误差、地图线宽与阴影差异仍应预期，未把未着色的白色对象补成建筑。

网页运行只需JSON与所用PNG，`deps/`、Python脚本和检查图片无需随HTML发布。
