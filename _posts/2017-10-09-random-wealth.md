---

layout: post
title:  "房间内 100 个人，每人有 100 块，每分钟随机给另一个人 1 块，最后这个房间内的财富分布是怎样的？"
date:   2017-10-09 16:00:19 +0800

---

之前看过一篇文章,  
[房间内 100 个人，每人有 100 块，每分钟随机给另一个人 1 块，最后这个房间内的财富分布是怎样的？](https://zhuanlan.zhihu.com/p/27797001?group_id=867778281376727040)

突然想到用js来展示, 更动态和直观, 在线实时的效果, 那就用[Highcharts](https://www.highcharts.com/)来实现一下.

<!--more-->

<div id="container" style="min-width:310px; height:400px; margin-bottom:15px;"> </div>
<div id="containerSort" style="min-width:310px; height:400px; margin:15px;"> </div>

<p>模拟每小时输出一次财富最小和最多的人</p>
<div id="datatable" style="min-width:310px;"> </div>


<script src="https://code.highcharts.com/highcharts.js"></script>
<script src="https://unpkg.com/jquery@3.2.1/dist/jquery.min.js"></script>

<script>

var numbersOfPeople = 100;

var data = [];
for(var i=1; i<=numbersOfPeople; i++){
  data.push({y:100,name:'x'+i});
}

setInterval(function() {
  var min=100, max=100
  var minperson='x1', maxperson='x1'
  for(var i in data){
    if (data[i]['y'] < min){
      min = data[i]['y']
      minperson = data[i]['name']
    }
    if (data[i]['y'] > max) {
      max = data[i]['y']
      maxperson = data[i]['name']
    }
  }
  var div = $('<div></div>').text(minperson+':'+min+';'+maxperson+':'+max)
  $('#datatable').append(div)
}, 6000)

var options = {
    title: {text:'未排序'},
    legend:{enabled:false},
    chart: {
        type: 'column',
        events: {
          load: function () {
              var series = this.series[0]
              setInterval(function () {
                for(var i in data){
                  var to = Math.floor(Math.random()*numbersOfPeople)
                  data[to]['y'] += 1
                  data[i]['y'] -= 1
                }
                series.setData(data, true, 0, false)
              }, 100);
          }
      }
    },
    xAxis: {
    	type: 'category'
    },
    yAxis: {
        min: 0,
        max: 200,
        title: {
            text: 'Wealth'
        }
    },
    plotOptions: {
        column: {
            pointPadding: 0.2,
            borderWidth: 0
        }
    },
    series: [{
      name: 'wealth',
      data: data
      }
    ]
}

Highcharts.chart('container', options);

var optionsSort = {
    title: {text:'排序效果'},
    legend:{enabled:false},
    chart: {
        type: 'column',
        events: {
          load: function () {
              var series = this.series[0]
              setInterval(function () {
                var sortdata = data.slice()
                sortdata.sort(function(a, b){return a['y']-b['y']})
                series.setData(sortdata, true, 0, false)
              }, 100);
          }
      }
    },
    xAxis: {
    	type: 'category'
    },
    yAxis: {
        min: 0,
        max: 200,
        title: {
            text: 'Wealth'
        }
    },
    plotOptions: {
        column: {
            pointPadding: 0.2,
            borderWidth: 0
        }
    },
    series: [{
      name: 'wealth',
      data: data
      }
    ]
}
Highcharts.chart('containerSort', optionsSort);

</script>
