/** .224 adds one private hub; all19 established definitions remain intact. */
import { GUILD_COMMANDS_222 } from './guild-command-definitions222';
export { ACCOUNT_COMMANDS_221, ADMIN_SUBCOMMANDS_221 } from './guild-command-definitions222';
export const GUILD_COMMANDS_224=Object.freeze([...GUILD_COMMANDS_222,{type:1,name:'olympus',description:'Open your private Olympus hub or check current guild access',options:[{type:1,name:'hub',description:'Open your private guild hub'},{type:1,name:'check',description:'Check current verification and guild access',options:[{type:6,name:'member',description:'Authorized guild staff: check a server member',required:false}]}]}]);
export const GUILD_COMMAND_NAMES_224=new Set(GUILD_COMMANDS_224.map(c=>c.name));
