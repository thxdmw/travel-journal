package com.thx.traveljournal.backup.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.journal.service.JournalTagService;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.entity.MediaAsset;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.mapper.MediaAssetMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 全站可恢复备份。结构化数据写入 manifest.json，每篇日记额外导出一份 Block JSON，
 * 图片按日记目录保存原图；整个 zip 流式写出，单张图片失败不会中断其余内容。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BackupService {
    /** 文件名里不安全的字符，统一换成短横线 */
    private static final Pattern UNSAFE_FILENAME = Pattern.compile("[^\\p{L}\\p{N}._-]+");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final ItineraryMapper itineraryMapper;
    private final BudgetCategoryMapper budgetMapper;
    private final ExpenseMapper expenseMapper;
    private final JournalMapper journalMapper;
    private final JournalMediaMapper journalMediaMapper;
    private final MediaAssetMapper assetMapper;
    private final JournalTagService tagService;
    private final MinioClient minioClient;
    private final ObjectMapper objectMapper;

    /** 建议的下载文件名，带时间戳避免多次导出互相覆盖。 */
    public String suggestedFilename() {
        return "travel-journal-backup-" + LocalDateTime.now().format(STAMP) + ".zip";
    }

    /**
     * 把全部内容写成 zip 输出到给定的流。
     *
     * @param includePhotos 是否包含照片原图。不含照片的备份小得多，适合日常快照
     */
    public void writeTo(OutputStream output, boolean includePhotos) throws IOException {
        List<Trip> trips = tripMapper.selectList(null);
        List<JournalEntry> journals = journalMapper.selectList(
                new LambdaQueryWrapper<JournalEntry>().orderByAsc(JournalEntry::getOccurredOn));
        Map<Long, Trip> tripById = trips.stream().collect(Collectors.toMap(Trip::getId, Function.identity()));

        try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            writeManifest(zip, trips, journals);
            Set<String> usedNames = new HashSet<>();
            for (JournalEntry journal : journals) {
                writeJournalJson(zip, journal, tripById.get(journal.getTripId()), usedNames);
                if (includePhotos) writePhotos(zip, journal);
            }
        }
    }

    /** 结构化数据整体写成一份 JSON，方便程序化恢复或迁移。 */
    private void writeManifest(ZipOutputStream zip, List<Trip> trips, List<JournalEntry> journals) throws IOException {
        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("exportedAt", LocalDateTime.now().toString());
        manifest.put("schemaVersion", 1);
        manifest.put("trips", trips.stream().map(trip -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("trip", trip);
            item.put("stops", stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                    .eq(TripStop::getTripId, trip.getId()).orderByAsc(TripStop::getSortOrder)));
            item.put("itinerary", itineraryMapper.selectList(new LambdaQueryWrapper<ItineraryItem>()
                    .eq(ItineraryItem::getTripId, trip.getId()).orderByAsc(ItineraryItem::getItemDate)));
            item.put("budgetCategories", budgetMapper.selectList(new LambdaQueryWrapper<BudgetCategory>()
                    .eq(BudgetCategory::getTripId, trip.getId()).orderByAsc(BudgetCategory::getSortOrder)));
            item.put("expenses", expenseMapper.selectList(new LambdaQueryWrapper<Expense>()
                    .eq(Expense::getTripId, trip.getId()).orderByAsc(Expense::getExpenseDate)));
            return item;
        }).toList());
        manifest.put("journals", journals.stream().map(journal -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", journal.getId());
            item.put("tripId", journal.getTripId());
            item.put("title", journal.getTitle());
            item.put("slug", journal.getSlug());
            item.put("status", journal.getStatus());
            item.put("occurredOn", journal.getOccurredOn());
            item.put("publishedAt", journal.getPublishedAt());
            item.put("tags", tagService.namesOf(journal.getId()));
            item.put("documentFile", jsonName(journal, new HashSet<>()));
            return item;
        }).toList());

        zip.putNextEntry(new ZipEntry("manifest.json"));
        zip.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(manifest));
        zip.closeEntry();
    }

    /** 单篇日记写成自包含 JSON，正文保持原始 Block 文档结构。 */
    private void writeJournalJson(ZipOutputStream zip, JournalEntry journal, Trip trip,
                                  Set<String> usedNames) throws IOException {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("title", journal.getTitle());
        item.put("slug", journal.getSlug());
        item.put("occurredOn", journal.getOccurredOn());
        item.put("status", journal.getStatus());
        item.put("trip", trip == null ? null : trip.getTitle());
        item.put("excerpt", journal.getExcerpt());
        item.put("tags", tagService.namesOf(journal.getId()));
        item.put("themeKey", journal.getThemeKey());
        item.put("templateId", journal.getTemplateId());
        item.put("templateVersion", journal.getTemplateVersion());
        item.put("content", journal.getContentJson());

        zip.putNextEntry(new ZipEntry("journals/" + jsonName(journal, usedNames)));
        zip.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(item));
        zip.closeEntry();
    }

    /** 照片按日记分目录，用原始文件名。 */
    private void writePhotos(ZipOutputStream zip, JournalEntry journal) {
        List<JournalMedia> relations = journalMediaMapper.selectList(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, journal.getId()).orderByAsc(JournalMedia::getSortOrder));
        Set<String> used = new HashSet<>();
        for (JournalMedia relation : relations) {
            MediaAsset asset = assetMapper.selectById(relation.getMediaAssetId());
            if (asset == null) continue;
            String name = uniqueName(safeName(asset.getOriginalFilename()), used);
            try (InputStream stream = minioClient.getObject(GetObjectArgs.builder()
                    .bucket(asset.getBucketName()).object(asset.getOriginalObjectKey()).build())) {
                zip.putNextEntry(new ZipEntry("photos/" + journal.getId() + "/" + name));
                stream.transferTo(zip);
                zip.closeEntry();
            } catch (Exception ex) {
                // 一张图拉不下来不该毁掉整个备份，记日志跳过即可
                log.warn("备份时跳过图片 assetId={} key={}：{}",
                        asset.getId(), asset.getOriginalObjectKey(), ex.getMessage());
            }
        }
    }

    private String jsonName(JournalEntry journal, Set<String> used) {
        String base = journal.getOccurredOn() + "-" + safeName(
                journal.getSlug() == null || journal.getSlug().isBlank() ? journal.getTitle() : journal.getSlug());
        return uniqueName(base + ".json", used);
    }

    private String safeName(String raw) {
        String value = UNSAFE_FILENAME.matcher(raw == null ? "" : raw).replaceAll("-");
        value = value.replaceAll("^-+|-+$", "");
        if (value.isBlank()) value = "untitled";
        return value.length() > 80 ? value.substring(0, 80) : value;
    }

    /** zip 里同名条目会互相覆盖，重名时补序号。 */
    private String uniqueName(String name, Set<String> used) {
        if (used.add(name)) return name;
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; ; i++) {
            String candidate = stem + "-" + i + ext;
            if (used.add(candidate)) return candidate;
        }
    }

}
