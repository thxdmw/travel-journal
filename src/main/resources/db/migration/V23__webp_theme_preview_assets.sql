-- 首页大图和主题预览图从 PNG 换成 WebP。
--
-- home-hero-kyoto.png 2.6MB、theme-travel-classic-preview.png 1.9MB，对一个手机访问
-- 占比很高的旅行站来说，这两张图就是首屏最贵的东西。转成 WebP 之后分别是 306KB 和 81KB，
-- 视觉上看不出区别。用户上传的图片本来就已经全部输出 WebP，这里只是让内置素材跟上。
--
-- 只改还指向内置 PNG 的那几条：作者自己换过预览图的主题，preview_image_url 指向
-- /api/media/...，不能被这次迁移碰到。

update theme_preset
   set preview_image_url = '/img/theme-travel-classic-preview.webp'
 where preview_image_url = '/img/theme-travel-classic-preview.png';
