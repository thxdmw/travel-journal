package com.thx.traveljournal.trip.service;

import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.service.JournalService;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.service.MomentService;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TripServiceTest {
    @Test
    void shouldRejectReversedDates() {
        TripService service = new TripService(mock(TripMapper.class), mock(TripStopMapper.class),
                mock(ItineraryMapper.class), mock(BudgetCategoryMapper.class),
                mock(ExpenseMapper.class), mock(JournalMapper.class),
                mock(com.thx.traveljournal.media.service.MediaService.class),
                mock(com.thx.traveljournal.journal.service.JournalService.class),
                mock(com.thx.traveljournal.moment.service.MomentService.class),
                mock(com.thx.traveljournal.media.mapper.JournalMediaMapper.class));
        Trip trip = new Trip();
        trip.setTitle("测试旅行");
        trip.setSlug("test-trip");
        trip.setStatus("PLANNING");
        trip.setDefaultCurrency("CNY");
        trip.setStartDate(LocalDate.of(2026, 8, 10));
        trip.setEndDate(LocalDate.of(2026, 8, 1));
        assertThatThrownBy(() -> service.create(trip))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("结束日期");
    }

    @Test
    void shouldRejectEmptyMapCoordinates() {
        TripMapper tripMapper = mock(TripMapper.class);
        Trip existing = new Trip();
        existing.setId(1L);
        when(tripMapper.selectById(1L)).thenReturn(existing);
        TripService service = new TripService(tripMapper, mock(TripStopMapper.class),
                mock(ItineraryMapper.class), mock(BudgetCategoryMapper.class),
                mock(ExpenseMapper.class), mock(JournalMapper.class),
                mock(com.thx.traveljournal.media.service.MediaService.class),
                mock(com.thx.traveljournal.journal.service.JournalService.class),
                mock(com.thx.traveljournal.moment.service.MomentService.class),
                mock(com.thx.traveljournal.media.mapper.JournalMediaMapper.class));
        TripStop stop = new TripStop();
        stop.setCityName("未选择地点");
        stop.setCountryName("中国");
        stop.setLatitude(BigDecimal.ZERO);
        stop.setLongitude(BigDecimal.ZERO);
        assertThatThrownBy(() -> service.createStop(1L, stop))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不能同时为 0");
    }

    private TripService serviceWithExistingTrip(Long tripId) {
        TripMapper tripMapper = mock(TripMapper.class);
        Trip existing = new Trip();
        existing.setId(tripId);
        when(tripMapper.selectById(tripId)).thenReturn(existing);
        return new TripService(tripMapper, mock(TripStopMapper.class),
                mock(ItineraryMapper.class), mock(BudgetCategoryMapper.class),
                mock(ExpenseMapper.class), mock(JournalMapper.class),
                mock(com.thx.traveljournal.media.service.MediaService.class),
                mock(com.thx.traveljournal.journal.service.JournalService.class),
                mock(com.thx.traveljournal.moment.service.MomentService.class),
                mock(com.thx.traveljournal.media.mapper.JournalMediaMapper.class));
    }

    private TripStop validStop() {
        TripStop stop = new TripStop();
        stop.setCityName("青城山");
        stop.setCountryName("中国");
        stop.setLatitude(BigDecimal.valueOf(30.9021));
        stop.setLongitude(BigDecimal.valueOf(103.5678));
        return stop;
    }

    /** 数据库长期标准坐标是 WGS84：没传坐标系时按新标准默认，不再默认成旧的 GCJ02。 */
    @Test
    void defaultsCoordinateSystemToWgs84WhenNotProvided() {
        TripService service = serviceWithExistingTrip(1L);
        TripStop stop = validStop();

        TripStop saved = service.createStop(1L, stop);

        assertThat(saved.getCoordinateSystem()).isEqualTo("WGS84");
    }

    /** 新写入即使明确来自 GCJ02，也必须在服务边界转成 WGS84 再落库。 */
    @Test
    void convertsExplicitGcj02InputToCanonicalWgs84() {
        TripService service = serviceWithExistingTrip(1L);
        TripStop stop = validStop();
        stop.setCoordinateSystem("gcj02");
        BigDecimal originalLatitude = stop.getLatitude();
        BigDecimal originalLongitude = stop.getLongitude();

        TripStop saved = service.createStop(1L, stop);

        assertThat(saved.getCoordinateSystem()).isEqualTo("WGS84");
        assertThat(saved.getLatitude()).isNotEqualByComparingTo(originalLatitude);
        assertThat(saved.getLongitude()).isNotEqualByComparingTo(originalLongitude);
    }

    @Test
    void rejectsUnknownCoordinateSystem() {
        TripService service = serviceWithExistingTrip(1L);
        TripStop stop = validStop();
        stop.setCoordinateSystem("BD09");

        assertThatThrownBy(() -> service.createStop(1L, stop))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("坐标系");
    }

    /*
     * ============================================================ 删除整场旅行
     *
     * 数据库上这些子表大多写着 on delete cascade，但级联只删表里的行：对象存储里的
     * 照片文件不会跟着走，「这张照片是不是还被别处引用」也没人判断。所以删除必须逐层
     * 走各自模块的清理逻辑，这里确认一层都没漏，而且顺序是对的。
     */

    /**
     * LambdaQueryWrapper 要靠 TableInfo 才能把方法引用翻译成列名，单测里没有 MyBatis 启动过程。
     * 删除路径会按 tripId 扫过好几张表，涉及的实体都得先登记。
     */
    private void initTableInfo(Class<?>... entities) {
        for (Class<?> entity : entities) {
            com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                    new org.apache.ibatis.builder.MapperBuilderAssistant(
                            new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                    entity);
        }
    }

    @Test
    void deletingATripCascadesThroughEveryModule() {
        initTableInfo(JournalEntry.class, JournalMedia.class, TripStop.class,
                ItineraryItem.class, Expense.class, BudgetCategory.class);
        TripMapper tripMapper = mock(TripMapper.class);
        Trip existing = new Trip();
        existing.setId(5L);
        existing.setTitle("成都旅行");
        when(tripMapper.selectById(5L)).thenReturn(existing);
        when(tripMapper.selectOne(any())).thenReturn(existing);

        JournalMapper journalMapper = mock(JournalMapper.class);
        JournalEntry first = new JournalEntry();
        first.setId(11L);
        JournalEntry second = new JournalEntry();
        second.setId(12L);
        when(journalMapper.selectList(any())).thenReturn(List.of(first, second));

        TripStopMapper stopMapper = mock(TripStopMapper.class);
        ItineraryMapper itineraryMapper = mock(ItineraryMapper.class);
        BudgetCategoryMapper budgetMapper = mock(BudgetCategoryMapper.class);
        ExpenseMapper expenseMapper = mock(ExpenseMapper.class);
        MediaService mediaService = mock(MediaService.class);
        JournalService journalService = mock(JournalService.class);
        MomentService momentService = mock(MomentService.class);
        JournalMediaMapper journalMediaMapper = mock(JournalMediaMapper.class);

        TripService service = new TripService(tripMapper, stopMapper, itineraryMapper, budgetMapper,
                expenseMapper, journalMapper, mediaService, journalService, momentService, journalMediaMapper);

        TripService.DeletionSummary summary = service.delete(5L);

        assertThat(summary.title()).isEqualTo("成都旅行");
        assertThat(summary.journalCount()).isEqualTo(2);

        // 每篇日记都要走 JournalService.delete：图片、封面引用和 MinIO 文件都在那里处理
        verify(journalService).delete(11L);
        verify(journalService).delete(12L);
        verify(momentService).purgeTripMoments(5L);
        // 支出必须先于预算分类删掉：expense 指向 budget_category，而那条外键不是级联的
        InOrder order = inOrder(expenseMapper, budgetMapper);
        order.verify(expenseMapper).delete(any());
        order.verify(budgetMapper).delete(any());
        verify(itineraryMapper).delete(any());
        verify(stopMapper).delete(any());
        verify(mediaService).clearTripCover(5L);
        verify(tripMapper).deleteById(5L);
    }

    @Test
    void deletingAMissingTripFailsBeforeTouchingAnything() {
        TripMapper tripMapper = mock(TripMapper.class);
        JournalService journalService = mock(JournalService.class);
        TripService service = new TripService(tripMapper, mock(TripStopMapper.class),
                mock(ItineraryMapper.class), mock(BudgetCategoryMapper.class), mock(ExpenseMapper.class),
                mock(JournalMapper.class), mock(MediaService.class), journalService,
                mock(MomentService.class), mock(JournalMediaMapper.class));

        assertThatThrownBy(() -> service.delete(404L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("旅行不存在");
        verify(journalService, never()).delete(any());
        verify(tripMapper, never()).deleteById(any(Long.class));
    }
}
