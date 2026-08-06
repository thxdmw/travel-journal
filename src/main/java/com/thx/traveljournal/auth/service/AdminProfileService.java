package com.thx.traveljournal.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.config.AppProperties;
import com.thx.traveljournal.theme.service.ThemePresetService;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.Http;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import net.coobird.thumbnailator.Thumbnails;
import org.apache.tika.Tika;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 管理员个人资料服务：头像上传和全站主题切换。
 *
 * <p>头像统一转成 512 像素的 webp 再存，既压缩体积也顺带剥掉 EXIF 里的拍摄信息。</p>
 */
@Service
public class AdminProfileService {
    public static final String DEFAULT_THEME = "travel-classic";
    public static final List<String> THEMES = List.of(DEFAULT_THEME, "sanya-breeze");
    private static final List<String> ALLOWED_IMAGE_TYPES = List.of("image/jpeg", "image/png", "image/webp");

    private final AdminUserMapper mapper;
    private final MinioClient minioClient;
    private final AppProperties properties;
    private final ThemePresetService themePresetService;
    private final Tika tika = new Tika();

    @Autowired
    public AdminProfileService(AdminUserMapper mapper, MinioClient minioClient, AppProperties properties,
                               ThemePresetService themePresetService) {
        this.mapper = mapper;
        this.minioClient = minioClient;
        this.properties = properties;
        this.themePresetService = themePresetService;
    }

    public AdminProfileService(AdminUserMapper mapper, MinioClient minioClient, AppProperties properties) {
        this(mapper, minioClient, properties, null);
    }

    public AdminUser requireByUsername(String username) {
        AdminUser user = mapper.selectOne(new LambdaQueryWrapper<AdminUser>()
                .eq(AdminUser::getUsername, username));
        if (user == null) throw BusinessException.notFound("管理员不存在");
        return user;
    }

    /** 取用于前台展示的管理员，即 id 最小的那个启用账号。 */
    public AdminUser publicUser() {
        AdminUser user = mapper.selectOne(new LambdaQueryWrapper<AdminUser>()
                .eq(AdminUser::getEnabled, true).orderByAsc(AdminUser::getId).last("limit 1"));
        if (user == null) throw BusinessException.notFound("管理员不存在");
        return user;
    }

    @Transactional
    public AdminUser updateTheme(String username, String themeKey) {
        if (themePresetService == null) {
            if (!THEMES.contains(themeKey)) throw BusinessException.badRequest("主题不存在");
        } else {
            themeKey = themePresetService.validateSelection(themeKey);
        }
        AdminUser user = requireByUsername(username);
        user.setThemeKey(themeKey);
        mapper.updateById(user);
        return user;
    }

    @Transactional
    /** 上传头像。新图写入成功后才更新数据库并删除旧图，中途失败不会弄丢原来的头像。 */
    public AdminUser uploadAvatar(String username, MultipartFile file) {
        AdminUser user = requireByUsername(username);
        byte[] uploaded;
        try {
            uploaded = file.getBytes();
        } catch (IOException ex) {
            throw new BusinessException("FILE_READ_ERROR", "读取头像文件失败", HttpStatus.BAD_REQUEST);
        }
        long limit = Math.min(properties.upload().maxFileSizeMb(), 5) * 1024 * 1024;
        if (uploaded.length == 0 || uploaded.length > limit) {
            throw BusinessException.badRequest("头像为空或超过 5MB 限制");
        }

        try {
            String mime = tika.detect(uploaded, file.getOriginalFilename());
            if (!ALLOWED_IMAGE_TYPES.contains(mime)) {
                throw BusinessException.badRequest("头像只支持 JPEG、PNG 和 WebP 图片");
            }
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(uploaded));
            if (image == null) throw BusinessException.badRequest("头像内容无法解码");
            if ((long) image.getWidth() * image.getHeight() > properties.upload().maxPixels()) {
                throw BusinessException.badRequest("头像像素超过限制");
            }
        } catch (IOException ex) {
            throw BusinessException.badRequest("头像内容无法识别");
        }

        byte[] avatar = normalizeAvatar(uploaded);
        String bucket = properties.minio().bucket();
        String newKey = "profile/" + user.getId() + "/avatar-" + UUID.randomUUID() + ".webp";
        String oldKey = user.getAvatarObjectKey();
        try {
            minioClient.putObject(PutObjectArgs.builder().bucket(bucket).object(newKey)
                    .stream(new ByteArrayInputStream(avatar), (long) avatar.length, -1L)
                    .contentType("image/webp").build());
            user.setAvatarObjectKey(newKey);
            mapper.updateById(user);
        } catch (Exception ex) {
            removeQuietly(bucket, newKey);
            throw new BusinessException("STORAGE_ERROR", "保存头像失败", HttpStatus.BAD_GATEWAY);
        }
        if (oldKey != null && !oldKey.isBlank()) removeQuietly(bucket, oldKey);
        return user;
    }

    public URI avatarAccess(AdminUser user) {
        if (user.getAvatarObjectKey() == null || user.getAvatarObjectKey().isBlank()) {
            throw BusinessException.notFound("尚未上传头像");
        }
        try {
            String url = minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Http.Method.GET).bucket(properties.minio().bucket())
                    .object(user.getAvatarObjectKey())
                    .expiry(properties.minio().presignedUrlTtlMinutes(), TimeUnit.MINUTES).build());
            return URI.create(url);
        } catch (Exception ex) {
            throw new BusinessException("STORAGE_ERROR", "生成头像访问地址失败", HttpStatus.BAD_GATEWAY);
        }
    }

    /** 头像的站内地址，查询串里的 v 是对象键哈希，用来做缓存击穿。 */
    public String avatarUrl(AdminUser user) {
        return user.getAvatarObjectKey() == null ? null
                : "/api/public/profile/avatar?v=" + Integer.toUnsignedString(user.getAvatarObjectKey().hashCode());
    }

    private byte[] normalizeAvatar(byte[] uploaded) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            Thumbnails.of(new ByteArrayInputStream(uploaded)).useExifOrientation(true)
                    .size(512, 512).outputFormat("webp").outputQuality(0.88).toOutputStream(output);
            return output.toByteArray();
        } catch (IOException ex) {
            throw new BusinessException("IMAGE_PROCESS_ERROR", "处理头像失败", HttpStatus.BAD_REQUEST);
        }
    }

    private void removeQuietly(String bucket, String key) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
        } catch (Exception ignored) {
        }
    }
}
