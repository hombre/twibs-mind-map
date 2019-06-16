/*
* Copyright (c) 2018 - 2019 by Michael Brinkmann (https://www.twibs.net)
*/

///<reference path="../src/twibs-mind-map.ts"/>

const mm = TwibsMindMaps.init(document.querySelector(".tmm-container"));
mm.attachButtons(document.querySelector(".toolbar"));
// mm.parse('[{"id":1,"parentId":0,"title":"My mind map","key":"","x":0,"y":0,"selected":false,"marked":false,"collapsed":false}]');
// noinspection SpellCheckingInspection
mm.load('[{"id":2,"parentId":1,"title":"Preparation","key":"","x":174.85643564356434,"y":343.6757425742575,"selected":false,"marked":false,"collapsed":false},{"id":5,"parentId":3,"title":"Adjust temperature","key":"","x":240.17821782178223,"y":94.43069306930697,"selected":false,"marked":false,"collapsed":false},{"id":4,"parentId":3,"title":"Comfortable bed","key":"","x":313.8960396039604,"y":-37.30198019801978,"selected":false,"marked":false,"collapsed":false},{"id":7,"parentId":2,"title":"Take a shower","key":"","x":228.35643564356434,"y":-1.7763568394002505e-15,"selected":false,"marked":false,"collapsed":false},{"id":1,"parentId":0,"title":"What to do<br>to sleep better","key":"","x":-114.32063975628338,"y":-47.202970297029665,"selected":false,"marked":false,"collapsed":false},{"id":3,"parentId":1,"title":"Environment","key":"","x":172.64356435643566,"y":-214.2698019801981,"selected":false,"marked":false,"collapsed":false},{"id":6,"parentId":3,"title":"Dim the light","key":"","x":362.8811881188119,"y":-107.30198019801983,"selected":false,"marked":false,"collapsed":false},{"id":8,"parentId":2,"title":"Listen to smooth music","key":"","x":201.16336633663366,"y":-80.8910891089109,"selected":false,"marked":false,"collapsed":false},{"id":9,"parentId":2,"title":"Set your gentle alarm","key":"","x":164,"y":70.00000000000001,"selected":false,"marked":false,"collapsed":false},{"id":10,"parentId":1,"title":"Timing","key":"","x":257.9603960396039,"y":122.14108910891093,"selected":false,"marked":false,"collapsed":false},{"id":11,"parentId":10,"title":"Sleep at least seven hours","key":"","x":246.2772277227723,"y":-76.5841584158416,"selected":false,"marked":false,"collapsed":false},{"id":14,"parentId":5,"title":"Turn of the heater","key":"","x":194.79207920792086,"y":83.51485148514853,"selected":false,"marked":true,"collapsed":false},{"id":17,"parentId":10,"title":"Create a bed time routine","key":"","x":192.24257425742576,"y":37.97029702970299,"selected":false,"marked":false,"collapsed":false},{"id":18,"parentId":1,"title":"Never","key":"","x":-215.97258187357195,"y":84.02142041127189,"selected":false,"marked":false,"collapsed":false},{"id":19,"parentId":18,"title":"Nap in the afternoon","key":"","x":-157.30769230769232,"y":-113.61538461538461,"selected":false,"marked":false,"collapsed":false},{"id":20,"parentId":18,"title":"Trink to much fluid before sleep","key":"","x":-185.00000000000006,"y":43.68395708372056,"selected":false,"marked":true,"collapsed":false},{"id":21,"parentId":18,"title":"Drink caffeine to late&nbsp;","key":"","x":-153.50000000000003,"y":143.30769230769232,"selected":false,"marked":false,"collapsed":false},{"id":22,"parentId":18,"title":"Work before sleep","key":"","x":-144.50000000000006,"y":-26.31604291627947,"selected":false,"marked":false,"collapsed":false},{"id":13,"parentId":5,"title":"Open the window if possible","key":"","x":209.96039603960398,"y":-47.87128712871289,"selected":false,"marked":false,"collapsed":false}]');
mm.clearUndoRedo();
mm.fitToContainer();
// // // mm.setEditing(false);
mm.onChanged = (mindMap) => {
  // console.log(mindMap.selected())
};
(window as any)['mm'] = mm;


