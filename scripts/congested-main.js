requirejs.config({
    baseUrl: '',
    paths: {
        "react": "https://npmcdn.com/react@15.3.0/dist/react.min",
        "reactDOM": "https://npmcdn.com/react-dom@15.3.0/dist/react-dom.min",
        "babel": "https://npmcdn.com/requirejs-react-jsx@1.0.2/babel-5.8.34.min",
        "jsx": "https://npmcdn.com/requirejs-react-jsx@1.0.2/jsx",
        "text": "https://npmcdn.com/requirejs-text@2.0.12/text",
    }
});


// Start loading the main app file. Put all of
// your application logic in there.

require(["jsx!/scripts/congested"], function(Congested){
    var c = new Congested();
    c.start();
});
