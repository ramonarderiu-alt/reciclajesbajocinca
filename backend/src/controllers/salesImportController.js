import {centreRatingSchema} from '../validations/schemas.js'
import {saveCentreRating} from '../repositories/centreRatingRepository.js'
import { importRowSchema,articleClassificationSchema,articleAssignmentSchema } from '../validations/schemas.js'
import * as service from '../services/salesImportService.js'
import * as repository from '../repositories/salesImportRepository.js'
export const preview=async(req,res)=>res.status(201).json(await service.preview(req.file,req.user,req.ip))
export const detail=async(req,res)=>res.json(await service.detail(req.params.id))
export const list=async(req,res)=>res.json(await repository.listImports())
export const updateRow=async(req,res)=>res.json(await service.updateRow(req.params.id,req.params.rowId,importRowSchema.parse(req.body),req.user,req.ip))
export const confirm=async(req,res)=>res.json(await service.confirm(req.params.id,req.user,req.ip))
export const cancel=async(req,res)=>{await service.cancel(req.params.id,req.user,req.ip);res.status(204).end()}
export const sales=async(req,res)=>res.json(await repository.salesByClient(req.user.company_id,req.query.from,req.query.to,String(req.query.article||'').trim()))
export const clientSales=async(req,res)=>res.json(await repository.clientSales(req.user.company_id,req.params.clientCode,req.query.from,req.query.to,String(req.query.article||'').trim(),Object.hasOwn(req.query,'centre')?(String(req.query.centre||'')||null):undefined))
export const articleSales=async(req,res)=>res.json(await repository.countableArticleSalesMatrix(req.user.company_id))
export const articleSalesLines=async(req,res)=>{const year=Number(req.query.year);if(!Number.isInteger(year)||year<1900||year>2200)return res.status(422).json({error:{code:'INVALID_YEAR',message:'Any no vàlid'}});res.json(await repository.articleSalesLines(req.user.company_id,req.params.articleCode,year,String(req.query.product_name||''))) }
export const articleClassification=async(req,res)=>res.json(await repository.classifiedArticles(req.user.company_id))
export const updateArticleClassification=async(req,res)=>{const body=articleClassificationSchema.parse(req.body);await repository.saveArticleClassification(req.user.company_id,body.articles,req.user.id);await (await import('../repositories/dataRepository.js')).audit({userId:req.user.id,action:'update',entity:'article_classification',recordId:req.user.company_id,newValues:{articles:body.articles},ip:req.ip});res.json(await repository.classifiedArticles(req.user.company_id))}
export const assignArticleClassification=async(req,res)=>{const body=articleAssignmentSchema.parse(req.body);const article=await repository.assignArticleClassification(req.user.company_id,body.product_code,body.product_name,body.category,req.user.id);await (await import('../repositories/dataRepository.js')).audit({userId:req.user.id,action:'update',entity:'article_classification',recordId:`${body.product_code}:${body.product_name}`,newValues:{category:body.category},ip:req.ip});res.json(article)}

export const rateCentre=async(req,res)=>{const body=centreRatingSchema.parse(req.body);res.json(await saveCentreRating(req.user.company_id,req.params.clientCode,body.centreName,body.rating,req.user.id,body.comment))}
