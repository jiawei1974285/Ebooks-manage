import axios from 'axios'

const api = axios.create({ baseURL: '' })

// Attach private-shelf token if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('privateToken')
  if (token) config.headers['X-Private-Token'] = token
  return config
})

// On 401 from private endpoints, clear stale token
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && err.config?.url?.includes('/api/')) {
      const msg = err.response.data?.detail || ''
      if (msg.includes('私密') || msg.includes('unlock')) {
        localStorage.removeItem('privateToken')
      }
    }
    return Promise.reject(err)
  }
)

export const privateStatus = () => api.get('/api/private/status')
export const privateUnlock = (password) => api.post('/api/private/unlock', { password })
export const privateLock = () => api.post('/api/private/lock')
export const privateSetPassword = (new_password, old_password) =>
  api.post('/api/private/set-password', { new_password, old_password })

export const getBooks = (params) => api.get('/api/books', { params })
export const getBook = (id) => api.get(`/api/books/${id}`)
export const updateBook = (id, data) => api.put(`/api/books/${id}`, data)
export const deleteBook = (id) => api.delete(`/api/books/${id}`)

export const scanDirectory = (directory) => api.post('/api/scan', { directory })
export const browseDirectory = (path = '') => api.get('/api/browse', { params: { path } })

export const generateSummary = (id) => api.post(`/api/books/${id}/summary`)
export const classifyBook = (id) => api.post(`/api/books/${id}/classify`)
export const embedBook = (id) => api.post(`/api/books/${id}/embed`)
export const embedAll = () => api.post('/api/embed-all')
export const batchAction = (action, book_ids) => api.post('/api/batch', { action, book_ids })

export const search = (q, mode = 'hybrid') => api.get('/api/search', { params: { q, mode } })
export const getCategories = (params) => api.get('/api/categories', { params })
export const getTags = (params) => api.get('/api/tags', { params })
export const autoTagBook = (id, replace = false) =>
  api.post(`/api/books/${id}/auto-tag`, null, { params: { replace } })
export const batchStreamUrl = (action, book_ids) => {
  const p = new URLSearchParams({ action })
  if (book_ids && book_ids.length) p.set('book_ids', book_ids.join(','))
  return `/api/batch/stream?${p.toString()}`
}
export const getGraph = () => api.get('/api/graph')
export const getStats = () => api.get('/api/stats')
export const chat = (question, opts = {}) => api.post('/api/chat', { question, ...opts })

export const indexBook = (id) => api.post(`/api/books/${id}/index`)
export const unindexBook = (id) => api.delete(`/api/books/${id}/index`)
export const indexStreamUrl = (bookIds) =>
  `/api/index/stream${bookIds ? `?book_ids=${bookIds.join(',')}` : ''}`

export const exportLibrary = () => api.get('/api/export')
export const getSystem = () => api.get('/api/system')

export const getSettings = () => api.get('/api/settings')
export const updateSettings = (data) => api.put('/api/settings', data)
export const testLLM = (data) => api.post('/api/settings/test', data)
export const testMinerU = (data) => api.post('/api/mineru/test', data)
export const mineruParse = (id, opts = {}) =>
  api.post(`/api/books/${id}/mineru`, null, { params: opts, timeout: 15 * 60 * 1000 })

export const getDuplicates = () => api.get('/api/duplicates')
export const rescanDuplicates = () => api.post('/api/duplicates/scan')

export const getCategoriesConfig = () => api.get('/api/categories/config')
export const updateCategoriesConfig = (categories) => api.put('/api/categories/config', { categories })
export const suggestCategories = () => api.post('/api/categories/suggest')
export const updateProgress = (id, last_page) => api.post(`/api/books/${id}/progress`, { last_page })
export const uploadFiles = (files) => {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  return api.post('/api/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const bookFileUrl = (id) => `/api/books/${id}/file`
export const openBookLocal = (id, reveal = false) =>
  api.post(`/api/books/${id}/open-local`, null, { params: { reveal } })
export const scanStreamUrl = (directory) => `/api/scan/stream?directory=${encodeURIComponent(directory)}`

export default api
