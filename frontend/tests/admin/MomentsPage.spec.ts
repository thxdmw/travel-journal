import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MomentsPage from '@/admin/pages/MomentsPage.vue'

const mocks = vi.hoisted(() => ({
  tripList: vi.fn(), momentList: vi.fn(), aiStatus: vi.fn(), create: vi.fn(), update: vi.fn(),
  remove: vi.fn(), addPhoto: vi.fn(), removePhoto: vi.fn(), route: vi.fn(), compose: vi.fn(),
  pendingMoments: vi.fn(), queueMoment: vi.fn(), updatePendingMoment: vi.fn(), dropPendingMoment: vi.fn(),
  push: vi.fn(), replace: vi.fn(),
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

function mountPage() {
  const message = vi.fn(), warning = vi.fn(), error = vi.fn(), info = vi.fn(), fail = vi.fn(), confirm = vi.fn().mockResolvedValue(undefined), composeConfirm = vi.fn().mockResolvedValue('confirm')
  const wrapper = mount(MomentsPage, {
    props: { session: { user: { id: 1 }, offline: false }, message, warning, error, info, fail, confirm, composeConfirm },
    global: { components: { ElButton, ElInput, ElSelect, ElOption, ElEmpty }, directives: { loading: () => undefined } },
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
