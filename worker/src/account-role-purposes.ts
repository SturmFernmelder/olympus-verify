/** Enrollment belongs only to the original successful new-login claim. No repair/bootstrap port. */
export const NEW_LOGIN_PURPOSES=['account_write','role_grant','role_remove','erasure'] as const;
export const NEW_LOGIN_PURPOSE_ROWS=`SELECT 'account_write' AS purpose,json_extract(?1,'$.purposeGeneration') AS generation
 UNION ALL SELECT 'role_grant',json_extract(?1,'$.roleGrantGeneration')
 UNION ALL SELECT 'role_remove',json_extract(?1,'$.roleRemoveGeneration')
 UNION ALL SELECT 'erasure',json_extract(?1,'$.erasureGeneration')`;
export const NEW_LOGIN_FOUR_PURPOSES_SQL=`EXISTS(SELECT 1 FROM account_purpose_generations WHERE account_id=json_extract(?1,'$.subject') AND account_generation=json_extract(?1,'$.accountGeneration') AND purpose='erasure' AND generation=json_extract(?1,'$.erasureGeneration') AND revision=0)
 AND EXISTS(SELECT 1 FROM account_purpose_generations WHERE account_id=json_extract(?1,'$.subject') AND account_generation=json_extract(?1,'$.accountGeneration') AND purpose='role_grant' AND generation=json_extract(?1,'$.roleGrantGeneration') AND revision=0)
 AND EXISTS(SELECT 1 FROM account_purpose_generations WHERE account_id=json_extract(?1,'$.subject') AND account_generation=json_extract(?1,'$.accountGeneration') AND purpose='role_remove' AND generation=json_extract(?1,'$.roleRemoveGeneration') AND revision=0)`;
