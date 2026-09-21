import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { requirePermission } from '../middleware/auth.js'
import { uploadPdf } from '../middleware/pdfUpload.js'
import * as controller from '../controllers/salesImportController.js'
const router=Router(),view=requirePermission('sales_clients.view'),manage=requirePermission('sales_clients.manage')
router.put('/sales/clients/:clientCode/centre-rating',manage,asyncHandler(controller.rateCentre))
router.get('/sales/clients',view,asyncHandler(controller.sales))
router.get('/sales/clients/:clientCode',view,asyncHandler(controller.clientSales))
router.get('/sales/articles',view,asyncHandler(controller.articleSales))
router.get('/sales/articles/:articleCode/lines',view,asyncHandler(controller.articleSalesLines))
router.get('/sales/articles/classification',view,asyncHandler(controller.articleClassification))
router.put('/sales/articles/classification',manage,asyncHandler(controller.updateArticleClassification))
router.patch('/sales/articles/classification',manage,asyncHandler(controller.assignArticleClassification))
router.get('/imports',view,asyncHandler(controller.list));router.get('/imports/:id',view,asyncHandler(controller.detail))
router.post('/imports/delivery-notes/preview',manage,uploadPdf,asyncHandler(controller.preview))
router.patch('/imports/:id/rows/:rowId',manage,asyncHandler(controller.updateRow));router.post('/imports/:id/confirm',manage,asyncHandler(controller.confirm));router.delete('/imports/:id',manage,asyncHandler(controller.cancel))
export default router
