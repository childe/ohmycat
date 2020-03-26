---

title: 忍者神龟
date: 2019-02-14T10:29:33+0800
layout: post

---

<script src="https://unpkg.com/vue"></script>

<div id="app">
<component :is="dynamicComponent" />
</div>

<script>
console.log("abcd")
var app = new Vue({
    el: '#app',
    data: {
        message: 'Hello Vue!'
    },
    computed: {
      dynamicComponent: function() {
        return {
          data: function(){ return { message: 'Hello Vue!' } },
          template: '<div>{' + '{message}}' + '</div>'
        }
      }
    }
});
console.log("xyz")
console.log(app)
</script>
