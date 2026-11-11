import {env,environmentSource} from '../config/env.js'
import {passwordRecoveryMailStatus} from '../services/mailService.js'

const status=passwordRecoveryMailStatus()
const required=['APP_PUBLIC_URL','PASSWORD_RECOVERY_TO','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM']
console.log(JSON.stringify({
 ...environmentSource,
 NODE_ENV:env.NODE_ENV,
 PORT:env.PORT,
 APP_PUBLIC_URL:env.APP_PUBLIC_URL,
 passwordRecoveryConfigured:status.ready,
 missingMailFields:required.filter(key=>!env[key]),
 configurationMessage:status.message
},null,2))
