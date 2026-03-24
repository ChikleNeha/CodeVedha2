export const MODULES = [
  { id:1, title:'Variables aur Print',   description:'Variable kya hota hai, naming rules, print function', icon:'📦', topics:['variable kya hota hai','naming rules','print function','string vs number'], estimatedMinutes:20 },
  { id:2, title:'Data Types',            description:'Integers, floats, strings, booleans aur type() function', icon:'🔢', topics:['integers','floats','strings','booleans','type() function'], estimatedMinutes:25 },
  { id:3, title:'Conditionals',          description:'if, else, elif, comparison operators', icon:'🔀', topics:['if statement','else statement','elif statement','comparison operators','nested conditions'], estimatedMinutes:30 },
  { id:4, title:'Loops',                 description:'for loop, while loop, range(), break aur continue', icon:'🔄', topics:['for loop','while loop','range() function','break aur continue'], estimatedMinutes:35 },
  { id:5, title:'Functions',             description:'def, parameters, return values, calling functions', icon:'⚙️', topics:['def keyword','parameters','return values','functions call karna','default parameters'], estimatedMinutes:40 }
]

export const SHORTCUTS = [
  { key:'J / F',      action:'Lesson rok ke sawaal poochho (mic khulega)' },
  { key:'Space',      action:'Code tab: mic shuru/rok · Quiz: primary action' },
  { key:'Enter',      action:'Confirm / submit' },
  { key:'Escape',     action:'Saari audio band karo' },
  { key:'R',          action:'Last audio dobara sunno · Code: last output repeat' },
  { key:'Q',          action:'Quiz tab pe jao' },
  { key:'L',          action:'Lesson tab pe jao' },
  { key:'X',          action:'Code tab pe jao' },
  { key:'C',          action:'Code tab: history clear karo' },
  { key:'N',          action:'Agla module' },
  { key:'P',          action:'Pichla module (Module 1 pe ho to progress sunao)' },
  { key:'H',          action:'Shortcuts help kholo/band karo' },
  { key:'Alt + C',    action:'High contrast toggle' },
  { key:'Alt + 1–4',  action:'Font size change karo' }
]

export const DIFFICULTY_LABELS = {
  beginner:     'Shuruaat',
  intermediate: 'Beech ka',
  advanced:     'Advanced'
}
