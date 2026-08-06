-- 为全部业务表和字段补充中文注释。
-- 只新增注释，不改动任何表结构和数据，因此可以安全地在已有数据的库上执行。
-- 注意：不要回头去改 V1~V4，那会让 Flyway 的校验和对不上，导致已部署的库启动失败。

-- ---------------------------------------------------------------- 管理员
comment on table admin_user is '管理员账号，系统为单管理员设计，通常只有一行';
comment on column admin_user.id is '主键';
comment on column admin_user.username is '登录用户名，全局唯一';
comment on column admin_user.password_hash is 'BCrypt 密码哈希，不存明文';
comment on column admin_user.display_name is '前台展示的昵称';
comment on column admin_user.enabled is '账号是否启用，停用后无法登录';
comment on column admin_user.last_login_at is '最近一次登录成功时间';
comment on column admin_user.avatar_object_key is '头像在对象存储中的键，为空表示未上传头像';
comment on column admin_user.theme_key is '当前选用的全站主题标识，对应 theme_preset.theme_key';
comment on column admin_user.created_at is '创建时间';
comment on column admin_user.updated_at is '最后更新时间';

-- ---------------------------------------------------------------- 媒体
comment on table media_asset is '图片文件本体，记录对象存储中三种规格的位置和图片元信息';
comment on column media_asset.id is '主键，前台图片地址 /api/media/{id}/{规格} 里的 id';
comment on column media_asset.bucket_name is '所在的对象存储桶名';
comment on column media_asset.original_object_key is '原图对象键，已剥离 EXIF，仅管理员可访问';
comment on column media_asset.display_object_key is '展示图对象键，最长边 1280 的 webp';
comment on column media_asset.thumbnail_object_key is '缩略图对象键，最长边 480 的 webp';
comment on column media_asset.original_filename is '上传时的原始文件名，仅作展示用';
comment on column media_asset.content_type is '由 Tika 嗅探出的真实 MIME 类型，不取客户端声明值';
comment on column media_asset.file_size is '原图字节数';
comment on column media_asset.width is '按 EXIF 方向摆正后的像素宽度';
comment on column media_asset.height is '按 EXIF 方向摆正后的像素高度';
comment on column media_asset.checksum_sha256 is '原图 SHA-256 校验和，用于排查重复和损坏';
comment on column media_asset.created_at is '创建时间';
comment on column media_asset.updated_at is '最后更新时间';

-- ---------------------------------------------------------------- 旅行
comment on table trip is '一次旅行，是城市、行程、预算、支出和日记的归属主体';
comment on column trip.id is '主键';
comment on column trip.title is '旅行标题';
comment on column trip.slug is '前台访问用的唯一短链，只允许小写字母、数字和短横线';
comment on column trip.summary is '旅行简介，展示在前台卡片和详情页';
comment on column trip.status is '旅行状态：PLANNING 规划中、ONGOING 旅行中、COMPLETED 已完成、ARCHIVED 已归档';
comment on column trip.start_date is '开始日期';
comment on column trip.end_date is '结束日期，不得早于开始日期';
comment on column trip.default_currency is '默认币种，三位大写字母代码，例如 CNY';
comment on column trip.cover_media_id is '封面图片，指向 media_asset；图片被删除时自动置空';
comment on column trip.internal_note is '仅后台可见的内部备注，不会出现在前台';
comment on column trip.theme_key is '旅行专属主题标识，为空表示继承全站主题';
comment on column trip.created_at is '创建时间';
comment on column trip.updated_at is '最后更新时间';

comment on table trip_stop is '旅行途经的城市或地点，同时提供前台地图上的坐标点';
comment on column trip_stop.id is '主键';
comment on column trip_stop.trip_id is '所属旅行，旅行删除时级联删除';
comment on column trip_stop.city_name is '城市或地点名称';
comment on column trip_stop.region_name is '省份或区域';
comment on column trip_stop.country_name is '国家名称';
comment on column trip_stop.country_code is 'ISO 两位大写国家代码，例如 CN';
comment on column trip_stop.latitude is '纬度，范围 -90 到 90，不能与经度同时为 0';
comment on column trip_stop.longitude is '经度，范围 -180 到 180，不能与纬度同时为 0';
comment on column trip_stop.place_id is '地图服务商返回的地点 id，用于二次检索';
comment on column trip_stop.formatted_address is '地图服务商返回的格式化详细地址';
comment on column trip_stop.adcode is '行政区划代码，用于按地区聚合统计';
comment on column trip_stop.coordinate_system is '坐标系：GCJ02 高德火星坐标、WGS84 国际标准坐标';
comment on column trip_stop.location_source is '坐标来源：AMAP_SEARCH 地点搜索、AMAP_REVERSE 逆地理编码、MAP_PICK 地图选点、MANUAL 手动填写';
comment on column trip_stop.arrival_date is '到达日期';
comment on column trip_stop.departure_date is '离开日期，不得早于到达日期';
comment on column trip_stop.sort_order is '同一旅行内的排序号，从 0 开始';
comment on column trip_stop.note is '备注';
comment on column trip_stop.created_at is '创建时间';
comment on column trip_stop.updated_at is '最后更新时间';

-- ---------------------------------------------------------------- 行程
comment on table itinerary_item is '按天安排的行程条目，例如交通、住宿、景点';
comment on column itinerary_item.id is '主键';
comment on column itinerary_item.trip_id is '所属旅行，旅行删除时级联删除';
comment on column itinerary_item.trip_stop_id is '关联的城市，城市删除时置空而不删除本行程';
comment on column itinerary_item.item_date is '行程日期，默认必须落在旅行的起止日期内';
comment on column itinerary_item.start_time is '开始时间';
comment on column itinerary_item.end_time is '结束时间，不得早于开始时间';
comment on column itinerary_item.type is '行程类型：TRANSPORT 交通、HOTEL 住宿、FOOD 餐饮、ATTRACTION 景点、SHOPPING 购物、ACTIVITY 活动、OTHER 其他';
comment on column itinerary_item.title is '行程标题';
comment on column itinerary_item.address is '地址';
comment on column itinerary_item.note is '备注';
comment on column itinerary_item.planned_cost is '预计花费，不能为负数';
comment on column itinerary_item.completed is '是否已完成';
comment on column itinerary_item.sort_order is '同一旅行内的排序号，从 0 开始';
comment on column itinerary_item.created_at is '创建时间';
comment on column itinerary_item.updated_at is '最后更新时间';

-- ---------------------------------------------------------------- 预算与支出
comment on table budget_category is '旅行的预算分类，新建旅行时会自动生成一套默认分类';
comment on column budget_category.id is '主键';
comment on column budget_category.trip_id is '所属旅行，旅行删除时级联删除';
comment on column budget_category.code is '分类编码，同一旅行内唯一，例如 TRANSPORT、HOTEL';
comment on column budget_category.name is '分类名称';
comment on column budget_category.planned_amount is '计划金额，不能为负数';
comment on column budget_category.sort_order is '排序号，从 0 开始';
comment on column budget_category.created_at is '创建时间';
comment on column budget_category.updated_at is '最后更新时间';

comment on table expense is '实际支出流水，用于和预算对比';
comment on column expense.id is '主键';
comment on column expense.trip_id is '所属旅行，旅行删除时级联删除';
comment on column expense.budget_category_id is '归属的预算分类，必须属于同一次旅行；仍有支出的分类不允许删除';
comment on column expense.trip_stop_id is '发生地城市，城市删除时置空';
comment on column expense.expense_date is '支出日期';
comment on column expense.amount is '支出金额，必须大于 0';
comment on column expense.description is '支出说明';
comment on column expense.merchant is '商户名称';
comment on column expense.note is '备注';
comment on column expense.created_at is '创建时间';
comment on column expense.updated_at is '最后更新时间';

-- ---------------------------------------------------------------- 日记
comment on table journal_entry is '旅行日记，前台展示的正文内容';
comment on column journal_entry.id is '主键';
comment on column journal_entry.trip_id is '所属旅行，旅行删除时级联删除';
comment on column journal_entry.trip_stop_id is '关联城市，必须属于同一次旅行；城市删除时置空';
comment on column journal_entry.title is '日记标题';
comment on column journal_entry.slug is '前台访问用的唯一短链，只允许小写字母、数字和短横线';
comment on column journal_entry.excerpt is '摘要，展示在列表卡片上';
comment on column journal_entry.content_markdown is 'Markdown 正文；其中的图片只允许使用站内地址 /api/media/{id}/display';
comment on column journal_entry.status is '状态：DRAFT 草稿、PUBLISHED 已发布；只有已发布的日记及其图片对访客可见';
comment on column journal_entry.occurred_on is '日记记录的事情发生的日期，不是写作日期';
comment on column journal_entry.cover_media_id is '封面图片，指向 media_asset；图片被删除时自动置空';
comment on column journal_entry.published_at is '发布时间，撤回后置空';
comment on column journal_entry.theme_key is '日记专属主题标识，为空表示继承旅行或全站主题';
comment on column journal_entry.template_id is '生成正文时使用的日记模板，模板被删除时置空';
comment on column journal_entry.template_version is '生成时的模板版本号，用于识别模板后续是否有改动';
comment on column journal_entry.template_data is '模板各区块的填写数据，JSON 对象';
comment on column journal_entry.template_snapshot is '生成时的模板定义快照，保证模板日后被改动也不影响已写好的日记';
comment on column journal_entry.template_detached is '正文是否已脱离模板自由编辑，为真时不再被模板重新生成覆盖';
comment on column journal_entry.created_at is '创建时间';
comment on column journal_entry.updated_at is '最后更新时间';

comment on table journal_media is '日记与图片的关联关系，一条记录表示某篇日记引用了某张图片';
comment on column journal_media.id is '主键，后台删除单张日记图片时用的就是这个 id';
comment on column journal_media.journal_entry_id is '所属日记，日记删除时级联删除';
comment on column journal_media.media_asset_id is '引用的图片；有关联存在时不允许直接删除图片记录';
comment on column journal_media.caption is '图片说明';
comment on column journal_media.sort_order is '同一日记内的图片排序号，从 0 开始';
comment on column journal_media.created_at is '创建时间';
comment on column journal_media.updated_at is '最后更新时间';

comment on table journal_template is '日记模板，把常写的结构固定下来，写作时只填当时的天气、心情和故事';
comment on column journal_template.id is '主键';
comment on column journal_template.name is '模板名称';
comment on column journal_template.description is '模板说明';
comment on column journal_template.category is '模板分类，例如 CITY_DAY 城市一日游、FOOD 美食探店、CUSTOM 自定义';
comment on column journal_template.definition_json is '模板区块定义，JSON 对象；区块类型限定在固定白名单内，不允许脚本或不受控 HTML';
comment on column journal_template.version is '版本号，每次修改自增，必须大于 0';
comment on column journal_template.enabled is '是否启用，停用后写作时不再出现在可选列表里';
comment on column journal_template.builtin is '是否为系统内置模板；内置模板不可直接修改或删除，需先复制为个人模板';
comment on column journal_template.created_at is '创建时间';
comment on column journal_template.updated_at is '最后更新时间';

-- ---------------------------------------------------------------- 主题
comment on table theme_preset is '主题预设，控制前台的色彩、字体、圆角、布局和图片风格';
comment on column theme_preset.id is '主键';
comment on column theme_preset.theme_key is '主题标识，全局唯一，被 admin_user、trip 和 journal_entry 引用';
comment on column theme_preset.name is '主题名称';
comment on column theme_preset.description is '主题说明';
comment on column theme_preset.base_theme_key is '基础视觉，取值 travel-classic 或 sanya-breeze，负责封面版式和 CSS 兜底';
comment on column theme_preset.preview_image_url is '主题预览图地址';
comment on column theme_preset.definition_json is '主题配置，JSON 对象，含 colors、typography、shape、layout、image、motion 六组设置';
comment on column theme_preset.builtin is '是否为系统预设；系统预设不可直接修改或删除，需先复制';
comment on column theme_preset.enabled is '是否启用，停用后不能被选用';
comment on column theme_preset.version is '版本号，每次修改自增';
comment on column theme_preset.created_at is '创建时间';
comment on column theme_preset.updated_at is '最后更新时间';
