import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MomentsPage from '@/admin/pages/MomentsPage.vue'

const mocks = vi.hoisted(() => ({
  tripList: vi.fn(), momentList: vi.fn(), aiStatus: vi.fn(), create: vi.fn(), update: vi.fn(),
  remove: vi.fn(), addPhoto: vi.fn(), removePhoto: vi.fn(), route: vi.fn(), compose: vi.fn(),
  pendingMoments: vi.fn(), queueMoment: vi.fn(), updatePendingMoment: vi.fn(), dropPendingMoment: vi.fn(),
  push: vi.fn(), replace: vi.fn(), simpleMap: vi.fn(), renderRoute: vi.fn(),
}))
vi.mock('@/api/trip', () => ({ tripApi: { options: mocks.tripList } }))
vi.mock('@/api/moment', () => ({ momentApi: {
  list: mocks.momentList, aiStatus: mocks.aiStatus, create: mocks.create, update: mocks.update,
  remove: mocks.remove, addPhoto: mocks.addPhoto, removePhoto: mocks.removePhoto,
  route: mocks.route, compose: mocks.compose,
} }))
vi.mock('@/draft/moments', () => ({
  pendingMoments: mocks.pendingMoments, queueMoment: mocks.queueMoment,
  updatePendingMoment: mocks.updatePendingMoment, dropPendingMoment: mocks.dropPendingMoment,
}))
vi.mock('@/route/simple-map', () => ({ simpleMap: mocks.simpleMap }))
vi.mock('@/route/day-route', () => ({ render: mocks.renderRoute }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {}, fullPath: '/moments', meta: {} }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

const ElButton = { props: ['loading', 'disabled'], emits: ['click'], template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>' }
const ElInput = { props: ['modelValue', 'placeholder', 'type', 'rows', 'maxlength', 'resize'], emits: ['update:modelValue'], template: '<textarea v-if="type === \'textarea\'" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea><input v-else :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)">' }
const ElSelect = { props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<select :value="modelValue ?? \'\'" :aria-label="placeholder" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>' }
const ElOption = { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' }
const ElEmpty = { props: ['description'], template: '<div class="el-empty">{{ description }}</div>' }

const trip = { id: 3, createdAt: '', updatedAt: '', title: '川西秋日', slug: 'west-sichuan', summary: null, status: 'ONGOING', startDate: '2026-10-01', endDate: '2026-10-07', defaultCurrency: 'CNY', coverMediaId: null, internalNote: null, themeKey: null }
const moment = { id: 9, clientId: null, tripId: 3, tripStopId: null, cityName: null, occurredAt: '2026-10-02T08:30:00+08:00', day: '2026-10-02', occurredZoneId: 'Asia/Shanghai', utcOffsetMinutes: 480, content: '山谷里起雾了', placeName: '折多山', latitude: null, longitude: null, mood: '安静', journalEntryId: null, sorted: false, photos: [] }

const ElSkeleton = { template: '<div class="el-skeleton" />' }
const ElSkeletonItem = { template: '<div class="el-skeleton-item" />' }
function mountPage() {
  const message = vi.fn(), warning = vi.fn(), error = vi.fn(), info = vi.fn(), fail = vi.fn(), confirm = vi.fn().mockResolvedValue(undefined), composeConfirm = vi.fn().mockResolvedValue('confirm')
  const wrapper = mount(MomentsPage, {
    props: { session: { user: { id: 1 }, offline: false }, message, warning, error, info, fail, confirm, composeConfirm },
    global: { components: { ElButton, ElInput, ElSelect, ElOption, ElEmpty, ElSkeleton, ElSkeletonItem }, directives: { loading: () => undefined } },
  })
  return { wrapper, message, warning, error, info, fail, confirm, composeConfirm }
}

describe('MomentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.tripList.mockResolvedValue([trip])
    mocks.momentList.mockResolvedValue([moment])
    mocks.aiStatus.mockResolvedValue({ available: false })
    mocks.pendingMoments.mockResolvedValue([])
    mocks.queueMoment.mockResolvedValue(true)
    mocks.replace.mockResolvedValue(undefined)
  })

  it('看路线拿到的是地图容器本身，不是一个数组', async () => {
    /*
     * 容器长在 v-for 里面。字符串 ref 处在 v-for 作用域内时 Vue 会把它收成数组，
     * 而数组是 truthy，一路穿过 simpleMap 的空值检查，直到建图那步才抛异常——
     * 那里的 catch 又是「后台失败就是没有地图，不弹提示」。于是点「看路线」什么都
     * 不发生，控制台也干干净净。ref 的类型是手写的，编译期同样看不出来。
     */
    mocks.route.mockResolvedValue([
      { latitude: 30.05, longitude: 101.96, occurredAt: '2026-10-02T08:30:00+08:00', source: 'GPS' },
    ])
    mocks.simpleMap.mockResolvedValue({ destroy: vi.fn(), invalidateSize: vi.fn() })
    mocks.renderRoute.mockReturnValue({ destroy: vi.fn(), play: vi.fn() })
    const { wrapper } = mountPage()
    await flushPromises()

    await wrapper.findAll('.moment-day header button')[0]?.trigger('click')
    await flushPromises()

    expect(mocks.simpleMap).toHaveBeenCalledTimes(1)
    const container = mocks.simpleMap.mock.calls[0]?.[0]
    expect(Array.isArray(container)).toBe(false)
    expect(container).toBeInstanceOf(HTMLElement)
    expect((container as HTMLElement).className).toContain('moment-route-map')
  })

  it('这一天没有位置信息时不建图，只给一句说明', async () => {
    mocks.route.mockResolvedValue([])
    const { wrapper, info } = mountPage()
    await flushPromises()

    await wrapper.findAll('.moment-day header button')[0]?.trigger('click')
    await flushPromises()

    expect(mocks.simpleMap).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalled()
  })

  it('默认选择进行中的旅行并按服务端日期分组', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    // 走轻量选项接口，旅行超过 100 场也不会在下拉里被静默截断
    expect(mocks.tripList).toHaveBeenCalledWith()
    expect(mocks.momentList).toHaveBeenCalledWith(3)
    expect(wrapper.get('.moment-day').text()).toContain('10月2日')
    expect(wrapper.get('.moment-item').text()).toContain('山谷里起雾了')
    expect(mocks.replace).toHaveBeenCalledWith({ path: '/moments', query: { tripId: '3' } })
  })

  it('先把文字安全写入本机队列再提示同步', async () => {
    const { wrapper, message } = mountPage()
    await flushPromises()
    await wrapper.get('textarea[placeholder="现在看到了什么？一句话就够。"]').setValue('路边的风很凉')
    await wrapper.get('.moment-composer-actions button:last-child').trigger('click')
    await flushPromises()
    expect(mocks.queueMoment).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 3,
      payload: expect.objectContaining({ tripId: 3, content: '路边的风很凉' }),
      photos: [],
    }))
    expect(message).toHaveBeenCalledWith('已安全记在本机，正在同步')
  })

  it('修改既有随手记后就地更新列表', async () => {
    mocks.update.mockResolvedValue({ ...moment, content: '雾散了一点' })
    const { wrapper, message } = mountPage()
    await flushPromises()
    await wrapper.get('.moment-item footer button').trigger('click')
    await wrapper.get('.moment-body textarea').setValue('雾散了一点')
    await wrapper.get('.moment-edit-actions button:last-child').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(9, expect.objectContaining({ content: '雾散了一点' }))
    expect(wrapper.get('.moment-item').text()).toContain('雾散了一点')
    expect(message).toHaveBeenCalledWith('已修改')
  })
})
