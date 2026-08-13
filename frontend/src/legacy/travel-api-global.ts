/*
 * 迁移兼容层：把 TS API 层重新拼成旧的 `window.TravelApi` 形状。
 *
 * 存在的唯一理由是让 static/js 下还没迁移的 IIFE 脚本（public-app.js、
 * admin/shared.js、trip-workspace.js）在完全不改动的前提下换上新实现。
 * 每个 key 都必须和原 js/common/api.js 逐条等价——名字、参数顺序、默认值、
 * HTTP 方法都不能变，否则受影响的是线上正在编辑的日记。
 *
 * TODO(迁移): 每有一个旧脚本迁到 SFC，就让它直接从 @/api/* 导入，
 * 并从下面删掉对应分支。全部迁完后整个文件删除，不保留 window 全局。
 */
import { ensureCsrf, http } from '@/api/client'
import { publicApi } from '@/api/public'
import { authApi } from '@/api/auth'
import { tripApi } from '@/api/trip'
import { journalApi, journalTagApi } from '@/api/journal'
import { mediaApi } from '@/api/media'
import { momentApi } from '@/api/moment'
import { themeApi } from '@/api/theme'
import { mapApi } from '@/api/map'
import { itineraryApi } from '@/api/itinerary'
import { budgetApi } from '@/api/budget'
import { backupApi, templateApi } from '@/api/template'

const travelApi = {
  http,
  ensureCsrf,
  public: {
    home: publicApi.home,
    trips: publicApi.trips,
    trip: publicApi.trip,
    journals: publicApi.journals,
    tags: publicApi.tags,
    years: publicApi.years,
    yearReview: publicApi.yearReview,
    journal: publicApi.journal,
    preview: publicApi.preview,
    cities: publicApi.cities,
    profile: publicApi.profile,
  },
  auth: {
    login: authApi.login,
    logout: authApi.logout,
    session: authApi.session,
    me: authApi.me,
    changePassword: authApi.changePassword,
    uploadAvatar: authApi.uploadAvatar,
    updateDisplayName: authApi.updateDisplayName,
    changeTheme: authApi.changeTheme,
  },
  admin: {
    trips: tripApi.list,
    trip: tripApi.get,
    createTrip: tripApi.create,
    updateTrip: tripApi.update,
    dashboard: tripApi.dashboard,
    uploadTripCover: tripApi.uploadCover,
    clearTripCover: tripApi.clearCover,
    stops: tripApi.stops,
    createStop: tripApi.createStop,
    updateStop: tripApi.updateStop,
    deleteStop: tripApi.deleteStop,

    mapStatus: mapApi.status,
    searchLocations: mapApi.search,
    reverseLocation: mapApi.reverse,

    itinerary: itineraryApi.list,
    createItinerary: itineraryApi.create,
    updateItinerary: itineraryApi.update,
    deleteItinerary: itineraryApi.remove,
    completeItinerary: itineraryApi.setCompleted,

    budget: budgetApi.summary,
    createCategory: budgetApi.createCategory,
    updateCategory: budgetApi.updateCategory,
    deleteCategory: budgetApi.deleteCategory,
    expenses: budgetApi.expenses,
    createExpense: budgetApi.createExpense,
    updateExpense: budgetApi.updateExpense,
    deleteExpense: budgetApi.deleteExpense,

    journals: journalApi.list,
    journal: journalApi.get,
    createJournal: journalApi.create,
    updateJournal: journalApi.update,
    createJournalDraft: journalApi.createDraft,
    saveJournalDraft: journalApi.saveDraft,
    discardEmptyJournal: journalApi.discardEmpty,
    deleteJournal: journalApi.remove,
    journalMediaCount: journalApi.mediaCount,
    publishJournal: journalApi.publish,
    unpublishJournal: journalApi.unpublish,
    createPreviewLink: journalApi.createPreviewLink,
    revokePreviewLink: journalApi.revokePreviewLink,

    media: mediaApi.list,
    uploadMedia: mediaApi.upload,
    sortMediaByCaptureTime: mediaApi.sortByCaptureTime,
    suggestCity: mediaApi.suggestCity,
    setCover: mediaApi.setCover,
    reorderMedia: mediaApi.reorder,
    updateMediaCaption: mediaApi.updateCaption,
    deleteMedia: mediaApi.remove,

    journalTags: journalTagApi.list,
    renameTag: journalTagApi.rename,
    mergeTag: journalTagApi.merge,
    deleteTag: journalTagApi.remove,
    purgeUnusedTags: journalTagApi.purgeUnused,

    templates: templateApi.list,
    template: templateApi.get,
    createTemplate: templateApi.create,
    updateTemplate: templateApi.update,
    deleteTemplate: templateApi.remove,
    duplicateTemplate: templateApi.duplicate,
    generateTemplate: templateApi.generate,

    moments: momentApi.list,
    moment: momentApi.get,
    unsortedMoments: momentApi.unsortedCount,
    createMoment: momentApi.create,
    updateMoment: momentApi.update,
    deleteMoment: momentApi.remove,
    addMomentPhoto: momentApi.addPhoto,
    removeMomentPhoto: momentApi.removePhoto,
    momentRoute: momentApi.route,
    momentAiStatus: momentApi.aiStatus,
    composeMoments: momentApi.compose,

    themes: themeApi.list,
    siteThemeState: themeApi.siteState,
    createTheme: themeApi.create,
    updateTheme: themeApi.update,
    deleteTheme: themeApi.remove,
    duplicateTheme: themeApi.duplicate,
    resetTheme: themeApi.reset,
    uploadThemeHero: themeApi.uploadHero,
    backupUrl: backupApi.url,
  },
} as const

export type TravelApiGlobal = typeof travelApi

declare global {
  interface Window {
    TravelApi: TravelApiGlobal
  }
}

window.TravelApi = travelApi

export { travelApi }
