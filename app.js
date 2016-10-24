

var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server);

server.listen(process.env.PORT || 4000, '0.0.0.0',function(){
	console.log('listening at port 4000');		
});

app.use(express.static(__dirname + '/public'));

app.get('/',function(req,res){
	res.sendFile('index.html');
});

var users = [];
io.sockets.on('connect',function(socket){
	console.log('socket connected');
	socket.on('user',function(){
		var id = socket.id.substring(2);
		console.log('user connected: '+id);
		socket.emit('user',id);
		users.push(id);
		/*if(users.length >=2){
			socket.emit('channel created',{'you':users[1],'partner':users[0]});
			io.sockets.connected['/#'+users[0]].emit('channel created',{'you':users[0],'partner':users[1]});
		}*/
	})
	socket.on('startstreaming',function(){
		console.log('user start streaming');
	});
	socket.on('msg',function(data){
		console.log('msg from: '+data.by+' msg to: '+data.to+' msg type: '+data.type);
		io.sockets.connected['/#'+data.by].emit('msg',data);
	})
	socket.on('pc2',function(data){
		console.log(data);
		socket.emit('pc2',data);
	})
})
