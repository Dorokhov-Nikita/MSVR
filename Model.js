

function deg2rad(angle) {
    return angle * Math.PI / 180;
}

// p: an array of xyz vertex coords
// t: an array of uv tex coords
function Vertex(p,t)
{
    this.p = p;
    this.t = t;
    this.normal = [];
    this.triangles = [];
}

function Triangle(v0, v1, v2)
{
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
    this.normal = [];
    this.tangent = [];
}

// Model Constructor function
function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iTexCoordsBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();
    this.count = 0;

    // Identifier of a diffuse texture
    this.idTextureDiffuse  = -1;

    this.BufferData = function(vertices, indices, texCoords) {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.count = indices.length;
    }

    this.Draw = function() {
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureDiffuse);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordsBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTexCoords, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTexCoords);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);

        //gl.drawArrays(gl.LINE_STRIP, 0, this.count);
        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    }

    this.DrawWireframe = function() {

        for (let p=0; p<this.count; p+=3)                    // offset in bytes (UNSIGNED_SHORT is two bytes)
            gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, p*2);
    }
}

function CreateSurfaceData(data) {
    const R1 = 1.0;
    const R2 = 3.0 * R1;
    const b  = 3.0 * R1;

    const aSteps    = 40;
    const betaSteps = 40;

    let vertices  = [];
    let texcoords = [];
    let indices   = [];

    for (let i = 0; i <= aSteps; i++) {
        let a = (2 * b * i) / aSteps;

        for (let j = 0; j <= betaSteps; j++) {
            let beta = (2 * Math.PI * j) / betaSteps;

            let r = (R2 - R1) * Math.pow(Math.sin((Math.PI * a) / (4 * b)), 2) + R1;

            let x = r * Math.cos(beta);
            let y = r * Math.sin(beta);
            let z = a;

            vertices.push(x, y, z);
            texcoords.push(i / aSteps, j / betaSteps);
        }
    }
 
    const rowSize = betaSteps + 1;
    for (let i = 0; i < aSteps; i++) {
        for (let j = 0; j < betaSteps; j++) {
            let a = i * rowSize + j;
            let b = a + 1;
            let c = (i + 1) * rowSize + j;
            let d = c + 1;

            indices.push(a, b, c);
            indices.push(b, d, c);
        }
    }

    data.verticesF32  = new Float32Array(vertices);
    data.texcoordsF32 = new Float32Array(texcoords);
    data.indicesU16   = new Uint16Array(indices);
}

function CreateSphereData(data, radius, latSteps, lonSteps) {
    let vertices = [], texcoords = [], indices = [];

    for (let i = 0; i <= latSteps; i++) {
        let theta = i * Math.PI / latSteps;
        for (let j = 0; j <= lonSteps; j++) {
            let phi = j * 2 * Math.PI / lonSteps;
            vertices.push(
                radius * Math.sin(theta) * Math.cos(phi),
                radius * Math.cos(theta),
                radius * Math.sin(theta) * Math.sin(phi)
            );
            texcoords.push(j / lonSteps, i / latSteps);
        }
    }

    const row = lonSteps + 1;
    for (let i = 0; i < latSteps; i++) {
        for (let j = 0; j < lonSteps; j++) {
            let a = i * row + j;
            indices.push(a, a+1, a+row);
            indices.push(a+1, a+row+1, a+row);
        }
    }

    data.verticesF32  = new Float32Array(vertices);
    data.texcoordsF32 = new Float32Array(texcoords);
    data.indicesU16   = new Uint16Array(indices);
}