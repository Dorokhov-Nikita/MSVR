'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let surfaceWebCam;              // A substrate for webcam image
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.
let stereoCam;                  // Object holding stereo camera and its parameters

let iTextureWebCam = null;

let video;

let soundSphere = null;

let isAudioStarted = false;
let frozenViewMatrix = null;

// Constructor
function ShaderProgram(name, program) {

    this.name = name;
    this.prog = program;

    // Location of the vertex attribute variable in the shader program.
    this.iAttribVertex = -1;
    // Location of the texture coordinate attribute variable in the shader program.
    this.iAttribTexCoords = -1;
    // Location of the uniform specifying a color for the primitive.
    this.iColor = -1;
    // Location of the uniform matrix representing the combined transformation.
    this.iModelViewProjectionMatrix = -1;
    // Location of the uniform matrix representing the modelview transformation
    this.iModelViewMatrix = -1;
    // Location of the TMU0
    this.iTMU0 = -1;

    this.Use = function() {
        gl.useProgram(this.prog);
    }
}

let sensorMatrix = m4.identity();
let ws = null;

function connectSensor() {
    const ip = document.getElementById('sensorIP').value;
    const port = document.getElementById('sensorPort').value;
    const url = `ws://${ip}:${port}/sensor/connect?type=android.sensor.orientation`;

    if (ws) ws.close();

    ws = new WebSocket(url);

    ws.onopen = () => {
        document.getElementById('wsStatus').textContent = 'Connected';
        document.getElementById('wsStatus').style.color = '#00ff88';
    };

    ws.onclose = () => {
        document.getElementById('wsStatus').textContent = 'Disconnected';
        document.getElementById('wsStatus').style.color = '#ff4444';
    };

    ws.onerror = () => {
        document.getElementById('wsStatus').textContent = 'Error';
        document.getElementById('wsStatus').style.color = '#ff4444';
    };

    const SMOOTH = 0.85;

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        const az    = data.values[0] * Math.PI / 180;
        const pitch = data.values[1] * Math.PI / 180;
        const roll  = data.values[2] * Math.PI / 180;

        const Rz = m4.axisRotation([0, 0, 1], az);
        const Rx = m4.axisRotation([1, 0, 0], pitch);
        const Ry = m4.axisRotation([0, 1, 0], roll);

        let tmp = m4.multiply(Rx, Rz);
        let newMatrix = m4.multiply(Ry, tmp);

        for (let i = 0; i < 16; i++) {
            sensorMatrix[i] = SMOOTH * sensorMatrix[i] + (1 - SMOOTH) * newMatrix[i];
        }
    };
}

// Web Audio
let audioCtx = null;
let panner = null;
let audioSource = null;
let biquadFilter = null;
let soundAngle = 0;
const SOUND_RADIUS = 3.0; 

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.listener.positionX.setValueAtTime(0, audioCtx.currentTime);
    audioCtx.listener.positionY.setValueAtTime(0, audioCtx.currentTime);
    audioCtx.listener.positionZ.setValueAtTime(0, audioCtx.currentTime);
    fetch('audio.mp3')
        .then(r => r.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => {
            audioSource = audioCtx.createBufferSource();
            audioSource.buffer = decoded;
            audioSource.loop = true;

            panner = audioCtx.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.maxDistance = 100;
            panner.rolloffFactor = 1;

            biquadFilter = audioCtx.createBiquadFilter();
            biquadFilter.type = 'bandpass';
            biquadFilter.frequency.value = 1000;
            biquadFilter.Q.value = 1.5;

            const filterEnabled = document.getElementById('filterEnabled').checked;

            if (filterEnabled) {
                audioSource.connect(biquadFilter);
                biquadFilter.connect(panner);
            } else {
                audioSource.connect(panner);
            }
            panner.connect(audioCtx.destination);

            audioSource.start();
            isAudioStarted = true;
            frozenViewMatrix = spaceball.getViewMatrix();
            isAudioStarted = true;
        });
}

function toggleFilter() {
    if (!audioSource || !panner || !biquadFilter) return;

    const enabled = document.getElementById('filterEnabled').checked;

    audioSource.disconnect();
    biquadFilter.disconnect();
    panner.disconnect();

    if (enabled) {
        audioSource.connect(biquadFilter);
        biquadFilter.connect(panner);
    } else {
        audioSource.connect(panner);
    }
    panner.connect(audioCtx.destination);
}

function updateSoundPosition() {
    if (!panner) return null;
    if (!panner) return;

    let x = SOUND_RADIUS * Math.cos(soundAngle);
    let y = 0;
    let z = SOUND_RADIUS * Math.sin(soundAngle);

    let vec = [x, y, z, 1];
    let res = m4.transformVector(sensorMatrix, vec);

    x = res[0];
    y = res[1];
    z = res[2];

    panner.positionX.setValueAtTime(x, audioCtx.currentTime);
    panner.positionY.setValueAtTime(y, audioCtx.currentTime);
    panner.positionZ.setValueAtTime(z, audioCtx.currentTime);

    return [x, y, z];
}

/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() { 
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniform1i(shProgram.iTMU0, 0);
    const soundPos = updateSoundPosition();
    console.log('soundPos:', soundPos);


    // PATH ZERO: DRAW ZERO PARALLAX WEBCAM

    if (iTextureWebCam) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, iTextureWebCam);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0,0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }

    let matrOrth = m4.orthographic(0,1,0,1, 1,100);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrOrth);
    
    let matrOrthView = m4.translation(0, 0, -14);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matrOrthView);

    gl.uniform1i(shProgram.bUseTexture, 1);
    surfaceWebCam.idTextureDiffuse = iTextureWebCam;
    surfaceWebCam.Draw();
    gl.uniform1i(shProgram.bUseTexture, 0);

    
    /* Get the view matrix from the SimpleRotator object.*/
    let modelView = isAudioStarted ? frozenViewMatrix : spaceball.getViewMatrix();

    let rotateToPointZero = m4.axisRotation([0.707,0.707,0], 0.7);
    let scaleDown = m4.scaling(0.04, 0.04, 0.04);
    let translateToPointZero = m4.translation(0,0,-14);

    const colorPolygon = new Float32Array([0.5,0.5,0.5,1]);
    const colorEdge    = new Float32Array([1,1,1,1]);

    // The FIRST PASS (for the left eye)

    let matrLeftFrustum = stereoCam.calcLeftFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrLeftFrustum);

    let translateLeftEye = m4. translation(stereoCam.eyeSeparation/2, 0, 0);

    let matAccum0 = m4.multiply(rotateToPointZero, modelView );
    if (!isAudioStarted) {
        matAccum0 = m4.multiply(sensorMatrix, matAccum0);
    }
    let matAccum1 = m4.multiply(translateLeftEye, matAccum0 );
    let matAccum2 = m4.multiply(translateToPointZero, matAccum1 );
    let matAccum3 = m4.multiply(scaleDown, matAccum2);
        
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum3 );

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1,0);

    gl.uniform1i(shProgram.bUseTexture, 0 );
    
    gl.colorMask(true, false, false, true);
    gl.uniform4fv(shProgram.iColor, colorPolygon );
    surface.Draw();
    gl.uniform4fv(shProgram.iColor, colorEdge );
    surface.DrawWireframe();

    // The SECOND PASS (for the right eye)

    gl.clear(gl.DEPTH_BUFFER_BIT);

    let matrRightFrustum = stereoCam.calcRightFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrRightFrustum);

    let translateRightEye = m4. translation(-stereoCam.eyeSeparation/2, 0, 0);

    matAccum0 = m4.multiply(rotateToPointZero, modelView );
    if (!isAudioStarted) {
        matAccum0 = m4.multiply(sensorMatrix, matAccum0);
    }
    matAccum1 = m4.multiply(translateRightEye, matAccum0 );
    matAccum2 = m4.multiply(translateToPointZero, matAccum1 );
    matAccum3 = m4.multiply(scaleDown, matAccum2);

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum3 );

    gl.colorMask(false, true, true, true);
    gl.uniform4fv(shProgram.iColor, colorPolygon );
    surface.Draw();
    gl.uniform4fv(shProgram.iColor, colorEdge );
    surface.DrawWireframe();

    if (soundPos && soundSphere) {
        const sx = soundPos[0];
        const sy = soundPos[1];
        const sz = soundPos[2];

        gl.disable(gl.POLYGON_OFFSET_FILL);

        let sphereModel = m4.translation(sx, sy, sz);
        let sphereScale = m4.scaling(0.05, 0.05, 0.05);

        gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrLeftFrustum);
        let sm1 = m4.multiply(translateLeftEye, sphereModel);
        let sm2 = m4.multiply(translateToPointZero, sm1);
        let sm3 = m4.multiply(sphereScale, sm2);
        gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, sm3);
        gl.colorMask(true, false, false, true);
        gl.uniform1i(shProgram.bUseTexture, 0);
        gl.uniform4fv(shProgram.iColor, colorPolygon);
        soundSphere.Draw();
        gl.uniform4fv(shProgram.iColor, colorEdge);
        soundSphere.DrawWireframe();

        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrRightFrustum);
        let sm1r = m4.multiply(translateRightEye, sphereModel);
        let sm2r = m4.multiply(translateToPointZero, sm1r);
        let sm3r = m4.multiply(sphereScale, sm2r);
        gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, sm3r);
        gl.colorMask(false, true, true, true);
        gl.uniform1i(shProgram.bUseTexture, 0);
        gl.uniform4fv(shProgram.iColor, colorPolygon);
        soundSphere.Draw();
        gl.uniform4fv(shProgram.iColor, colorEdge);
        soundSphere.DrawWireframe();
    }

    // RESET specific params to their default state

    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
}



// Initialize the WebGL context. Called from init()
function initGL() {
    let prog = createProgram( gl, vertexShaderSource, fragmentShaderSource );

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    shProgram.iAttribVertex              = gl.getAttribLocation(prog, "vertex");
    shProgram.iAttribTexCoords           = gl.getAttribLocation(prog, "tex");
    shProgram.iModelViewMatrix           = gl.getUniformLocation(prog, "ModelViewMatrix");
    shProgram.iProjectionMatrix          = gl.getUniformLocation(prog, "ProjectionMatrix");
    shProgram.iColor                     = gl.getUniformLocation(prog, "color");
    shProgram.bUseTexture                = gl.getUniformLocation(prog, "bUseTexture");
   
    shProgram.iTMU0                      = gl.getUniformLocation(prog, "iTMU0");

    let data = {};
    
    CreateSurfaceData(data)

    surface = new Model('Surface');
    surface.BufferData(data.verticesF32, data.indicesU16, data.texcoordsF32);


    surfaceWebCam = new Model('SurfaceWebCam');
    const wcVerts = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0
    ]);
    const wcTex = new Float32Array([
        0, 1,
        1, 1,
        1, 0,
        0, 0
    ]);
    const wcIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);
    surfaceWebCam.BufferData(wcVerts, wcIdx, wcTex);

    stereoCam = new StereoCamera(
        .7,
        14.0,
        1.0,
        0.4,
        0.5,
        100.0
    );

    surface.idTextureDiffuse  = LoadTexture();

    soundSphere = new Model('SoundSphere');
    let sphereData = {};
    CreateSphereData(sphereData, 1.0, 16, 16);
    soundSphere.BufferData(sphereData.verticesF32, sphereData.indicesU16, sphereData.texcoordsF32);
    soundSphere.idTextureDiffuse = surface.idTextureDiffuse;

    gl.enable(gl.DEPTH_TEST);
}


/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.  If an error occurs while compiling or
 * linking the program, an exception of type Error is thrown.  The error
 * string contains the compilation or linking error.  If no error occurs,
 * the program identifier is the return value of the function.
 * The second and third parameters are strings that contain the
 * source code for the vertex shader and for the fragment shader.
 */
function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader( gl.VERTEX_SHADER );
    gl.shaderSource(vsh,vShader);
    gl.compileShader(vsh);
    if ( ! gl.getShaderParameter(vsh, gl.COMPILE_STATUS) ) {
        throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
     }
    let fsh = gl.createShader( gl.FRAGMENT_SHADER );
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if ( ! gl.getShaderParameter(fsh, gl.COMPILE_STATUS) ) {
       throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog,vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if ( ! gl.getProgramParameter( prog, gl.LINK_STATUS) ) {
       throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
    }
    return prog;
}


// initialization function that will be called when the page has loaded
function init() {
    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");
        if ( ! gl ) {
            throw "Browser does not support WebGL";
        }
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        initGL();  // initialize the WebGL graphics context
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    video = document.createElement('video');
    video.autoplay = true;

    // Connect to video stream
    let constraints = {video: true};
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        video.srcObject = stream;

        let track = stream.getVideoTracks()[0];
        let settings = track.getSettings();

        video.oncanplay = function () {
            console.log("Video object is ready to render frames");
            iTextureWebCam = CreateWebCamTexture(settings.width, settings.height);
        };

        // Fired when the browser has metadata (width, height, duration, etc.)
        video.onloadedmetadata = function () {
            console.log("Video object metadata is loaded:", video.videoWidth, video.videoHeight);
            video.play();
        };
    })
    .catch(function(err) {
        console.log(err.name + ": " + err.message);
    }
    );

    setInterval(draw, 50);

    spaceball = new TrackballRotator(canvas, draw, 0);

    draw();
}

function updateParameters() {
    stereoCam.eyeSeparation        = parseFloat(document.getElementById('eyeSeparation').value);
    stereoCam.FOV                  = parseFloat(document.getElementById('fov').value);
    stereoCam.nearClippingDistance = parseFloat(document.getElementById('nearClipping').value);
    stereoCam.convergence          = parseFloat(document.getElementById('convergence').value);
    draw();
}

function setSoundAngle(val) {
    soundAngle = parseFloat(val);
}