window.actions = [];
function async_player(e) {
    // pop from the queue
    const action = window.actions.pop();
    if (action) {
        action();
    }
}


window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const element = document.getElementById('embed-iframe');
    const options = {
        uri: 'spotify:track:6ceLJHWkvMM3oc0Ftodrdm'
    };
    const callback = (EmbedController) => {
        window.EmbedController = EmbedController;
        // window.EmbedController.addListener('playback_update', async_player);
    };
    IFrameAPI.createController(element, options, callback);
};


Array.from(document.getElementsByClassName('player_btn')).forEach((element) => {
    element.addEventListener('click', () => {
        console.log('click');
        window.EmbedController.loadUri('spotify:track:2IOp9e0tEe7TyixGE0DSql');
        window.EmbedController.play();
        window.EmbedController.seek(100);
        // window.actions.push(() => { window.EmbedController.seek(10); });
        // window.actions.push(() => { window.EmbedController.play(); });
    });
});