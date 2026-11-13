import test from 'node:test';import assert from 'node:assert/strict';import { checkImageMarkup, assessImageBudget } from '../scripts/check-images.mjs';
test('public image requires meaningful alt or explicit decorative intent and dimensions',()=>{
 assert.deepEqual(checkImageMarkup('<img src="view.webp" alt="Stone bridge over a river" width="800" height="600">'),[]);
 assert.deepEqual(checkImageMarkup('<img src="decoration.webp" alt="" role="presentation" width="20" height="20">'),[]);
 for(const markup of ['<img src="x.jpg" width="1" height="1">','<img src="x.jpg" alt="" width="1" height="1">','<img src="x.jpg" alt="IMG_1234.jpg" width="1" height="1">','<img src="x.jpg" alt="A bridge">'])assert.ok(checkImageMarkup(markup).length);
});
test('image and aggregate page budgets fail oversized assets without modifying photographs',()=>{
 assert.deepEqual(assessImageBudget([{file:'view.webp',bytes:100000,width:1200,height:800}]),[]);
 assert.ok(assessImageBudget([{file:'large.jpg',bytes:400000,width:1200,height:800}]).length);
 assert.ok(assessImageBudget(Array.from({length:10},(_,i)=>({file:i+'.jpg',bytes:250000,width:1200,height:800}))).length);
 assert.ok(assessImageBudget([{file:'huge.jpg',bytes:100000,width:9000,height:9000}]).length);
});
