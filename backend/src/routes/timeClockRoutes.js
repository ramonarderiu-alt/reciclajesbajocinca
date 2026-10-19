import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { requirePermission } from '../middleware/auth.js'
import * as c from '../controllers/timeClockController.js'
const router=Router()
router.use(requirePermission('time_clock.view'))
router.get('/time-clock/status',asyncHandler(c.status))
router.get('/time-clock/today/:email',asyncHandler(c.todayByEmail))
router.get('/time-clock/today-by-code/:code',asyncHandler(c.todayByCode))
router.post('/time-clock/punch',asyncHandler(c.punch))
router.get('/time-clock/working',asyncHandler(c.workers))
router.get('/time-clock/recent',asyncHandler(c.recent))
router.get('/time-clock/my-control',asyncHandler(c.mine))
router.get('/time-clock/settings',asyncHandler(c.settings))
router.patch('/time-clock/settings',asyncHandler(c.saveSettings))
router.get('/time-clock/admin',asyncHandler(c.admin))
router.get('/time-clock/admin/export',asyncHandler(c.exportAdmin))
router.patch('/time-clock/entries/:id',asyncHandler(c.edit))
router.post('/time-clock/entries/:id/exit',asyncHandler(c.addExit))
router.get('/time-clock/payroll-summary',asyncHandler(c.payroll))
router.get('/time-clock/payroll-summary/export',asyncHandler(c.exportPayroll))
router.get('/time-clock/multi-operators',asyncHandler(c.operators))
router.get('/time-clock/multi-excess',asyncHandler(c.excess))
export default router
