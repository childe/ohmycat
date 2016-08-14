define(function(require){
    var React = require('react');
    var ReactDOM = require('reactDOM');

    function Congested(){
        var CongestedCanvas = React.createClass({
            render: function(){
                var _ = this;
                var statusP = this.state.status.map(function(s,idx){
                    return (
                        <p>第{parseInt((s[0]-_.props.starttime)/1000)}秒 {s[1]}</p>
                    );
                });
                return (
                    <div>
                        <canvas id="canvas" width={this.props.params.blockwidth+this.props.params.carlength} height={this.props.params.blockheight+this.props.params.carlength}>
                        </canvas>
                        <div id="status">
                            {statusP}
                        </div>
                    </div>
                );
            },
            getInitialState: function(){
                var carcount = Math.min(this.props.params.carcount, 2*(this.props.params.blockwidth+this.props.params.blockheight)/this.props.params.space);
                var cars = [];
                for(var i=0; i<carcount; i++){
                    //cars.push(this.props.params.space * (i+Math.random()-0.5));
                    cars.push(this.props.params.space * i);
                }
                return {cars:cars, c:0, status:[[new Date(),"开始.一共有"+carcount.toString()+"辆车"]]};
            },
            componentDidUpdate: function(){
                var canvas = document.getElementById("canvas");
                if (canvas == null)
                    return false;
                var context = canvas.getContext("2d");
                context.clearRect(0, 0, canvas.width, canvas.height);
                //console.log(canvas.width, canvas.height);

                var width=this.props.params.blockwidth, height=this.props.params.blockheight;
                var carlength=this.props.params.carlength,carwidth=this.props.params.carwidth
                //console.log(width, height, carlength, carwidth);

                for(var i in this.state.cars){
                    i = parseInt(i);
                    var p = this.state.cars[i];

                    if (i === this.state.minspeedcar){
                        context.fillStyle = 'red';
                    }else if (this.state.lowcars.indexOf(i)!=-1){
                        context.fillStyle = 'orange';
                    }else{
                        context.fillStyle = 'black';
                    }
                    //console.log(p);
                    if (p <= width){
                        context.fillRect(p, 0, carlength, carwidth);
                    }else if(p <= width + height){
                        context.fillRect(width, (p-width), carwidth, carlength);
                    }else if(p <= width*2 + height){
                        context.fillRect(width*2-p+height, height, carlength, carwidth);
                    }else{
                        context.fillRect(0, 2*(width+height)-p, carwidth, carlength);
                    }
                }
            },
            updateFrame: function(){
                var c = this.state.c+1;
                //console.log(this.state.c);
                //if (this.state.c>2) return;
                var cars = this.state.cars;
                //if (this.state.c % 100 == 1){
                //console.log(cars);
                //}
                var total = this.props.total;
                var space = this.props.params.space;
                var newCars = [];
                var minspeed = 0x0fffffff, minspeedcar=-1, lowcars=[];
                for(var i in cars){
                    i = parseInt(i);
                    var increase = this.props.increase;
                    var p = cars[i], nextCar = cars[(i+1)%cars.length], 
                        gap = (total + nextCar - p) % total - space;
                    //console.log(p,nextCar,gap,total,space);

                    if (gap < -this.props.params.smallthreshold*space){
                        increase = 0;
                    }else if (gap > this.props.params.bigthreshold*space){
                        increase = this.props.maxincrease;
                    }else{
                        increase += gap * this.props.params.acceleration;
                    }

                    //if (increase > this.props.maxincrease){
                        //console.log(increase,i,p,nextCar,gap);
                    //}

                    if (increase <= minspeed){
                        minspeed = increase;
                        minspeedcar = i;
                    }
                    if (increase <= 0.5 * this.props.increase){
                        lowcars.push(i);
                    }
                    newCars.push( (p+increase)%total );
                }

                var status = this.state.status;
                if (minspeed <= 0.99) {
                    if (c % parseInt(1/this.props.params.interval) == 0){
                        status.unshift([new Date(), "第" + (this.props.carcount-minspeedcar).toString()+ "辆车速度最低, 是" + (minspeed/this.props.params.interval).toString()]);
                    }
                }
                if (this.state.c >= this.props.params.startsleep/this.props.params.interval && this.state.c <= this.props.params.endsleep/this.props.params.interval){
                    newCars[cars.length-1] = cars[cars.length-1];
                }
                this.setState({cars:newCars, c:c, status: status, minspeedcar:minspeedcar, lowcars:lowcars});
            },
            componentWillMount: function() {
                this.props.total = 2*(this.props.params.blockwidth + this.props.params.blockheight);
                this.props.carcount = Math.min(this.props.params.carcount, 2*(this.props.params.blockwidth+this.props.params.blockheight)/this.props.params.space);
                this.props.increase = this.props.params.carspeed*this.props.params.interval;
                this.props.maxincrease = this.props.params.maxspeed*this.props.params.interval;
                this.props.starttime = new Date();
            },
            componentDidMount: function() {
                setInterval(this.updateFrame, this.props.params.interval*1000);
            },
        });

        var params = {
            space: 10,
            carlength: 3,
            carwidth: 1.8,
            carcount:10000,
            carspeed:20,
            maxspeed:30,
            smallthreshold: 0.4, //space*smallthreshold > carlength
            bigthreshold: 5,
            blockwidth: 500,
            blockheight: 500,
            acceleration: 0.2,
            interval: 0.05,

            startsleep: 1,
            endsleep: 6,
        };
        Congested.prototype.start = function(){
            ReactDOM.render(<CongestedCanvas params={params}/>, document.getElementById("container"));
        };
    };
    return Congested;
});
