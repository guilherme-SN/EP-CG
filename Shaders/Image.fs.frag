uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform float iTime;
uniform vec4 iMouse;
uniform vec2 iResolution;
uniform int iFrame;
out vec4 C;


// ====================================================
//                     CONSTANTES
// ====================================================
const float PI = 3.1459;

// Parâmetros gerais
const int MAX_STEPS = 100;               // Número máximo de iterações do ray marching
const float MAX_DISTANCE = 80.0;         // Distância máxima que o raio pode percorrer
const float MIN_DISTANCE = 0.01;         // Distância mínima para considerar uma colisão
const float SPEED = 4.0;                 // Velocidade da câmera indo para frente

// Parâmetros do ciclo dia/noite
const float DAY_DURATION = 9.0;          // Duração de um ciclo completo dia+noite em segundos
const float DAY_NIGHT_RATIO = 0.5;       // Proporção do ciclo que é dia (0.0 a 1.0)



// ====================================================
//                    ESTRUTURAS
// ====================================================
// Estrutura que representa objeto atingido pelo raymarching
struct Surface {
    float dist;    // Distância da interseção
    vec3 color;    // Cor do objeto
    float id;      // ID para diferenciar objetos
};



// ====================================================
//                 FUNÇÕES DE ROTAÇÃO
// ====================================================
vec3 rotateX(vec3 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    mat2 m = mat2(c, -s, s, c);

    p.yz = m * p.yz;

    return p;
}

vec3 rotateY(vec3 p, float angle) {
    float s = sin(angle); 
    float c = cos(angle);
    mat2 m = mat2(c, -s, s, c);

    return vec3(m * p.xz, p.y);
}



// ====================================================
//              SIGNED DISTANCE FUNCTIONS
// ====================================================
// Esfera
float sdSphere(vec3 p, vec4 sphere) {
    return length(p - sphere.xyz) - sphere.w;
}


// Cubo
float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}


// Plano horizontal
float sdPlane(vec3 p) {
    return p.y + 1.5;
}


// Estrada (retângulo achatado)
float sdRoad(vec3 p) {
    vec2 size = vec2(1.5, 0.01);    // largura e espessura da estrada
    vec2 d = abs(vec2(p.x, p.y + 1.5)) - size;

    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}


// Cilindro vertical
float sdVerticalCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}


// Livro
vec2 sdBook(vec3 p) {
    vec2 res = vec2(1e6, -1.0);     // Distância e ID

    vec3 s = vec3(0.4, 0.7, 0.09);
    float t = 0.001;

    float d;

    // Face 1: Capa Frontal (+Z) - ID 8.0
    d = sdBox(p - vec3(0, 0, s.z), vec3(s.x, s.y, t));
    if (d < res.x) res = vec2(d, 8.0);

    // Face 2: Capa Traseira (-Z) - ID 9.0
    d = sdBox(p - vec3(0, 0, -s.z), vec3(s.x, s.y, t));
    if (d < res.x) res = vec2(d, 9.0);

    // Face 3: Lombada (-X) - ID 10.0
    d = sdBox(p - vec3(-s.x, 0, 0), vec3(t, s.y, s.z));
    if (d < res.x) res = vec2(d, 10.0);

    // Face 4: Páginas lateral (+X) - ID 11.0
    d = sdBox(p - vec3(s.x, 0, 0), vec3(t, s.y, s.z));
    if (d < res.x) res = vec2(d, 11.0);

    // Face 5: Páginas topo (+Y) - ID 12.0
    d = sdBox(p - vec3(0, s.y, 0), vec3(s.x, t, s.z));
    if (d < res.x) res = vec2(d, 12.0);

    // Face 6: Páginas base (-Y) - ID 13.0
    d = sdBox(p - vec3(0, -s.y, 0), vec3(s.x, t, s.z));
    if (d < res.x) res = vec2(d, 13.0);

    return res;
}


// Bolo
vec2 sdCake(vec3 p) {
    vec2 res = vec2(1e6, -1.0);

    float scale = 0.6;      // Fator de escala do bolo

    // Dimensões do bolo
    float plateRadius = 1.2 * scale;
    float plateHeight = 0.05 * scale;

    float layer1Radius = 0.9 * scale;
    float layer1Height = 0.4 * scale;
    
    float layer2Radius = 0.6 * scale;
    float layer2Height = 0.3 * scale;

    float coverThickness = 0.03 * scale;


    // Prato
    float d = sdVerticalCylinder(p - vec3(0, -layer1Height - layer2Height - plateHeight, 0), plateHeight, plateRadius);
    if (d < res.x) res = vec2(d, 20.0);

    // Camada 1 do bolo
    d = sdVerticalCylinder(p - vec3(0, -layer2Height - layer1Height/2.0, 0), layer1Height/2.0, layer1Radius);
    if (d < res.x) res = vec2(d, 21.0);

    // Cobertura da camada 1
    d = sdVerticalCylinder(p - vec3(0, -layer2Height, 0), coverThickness, layer1Radius + coverThickness);
    if (d < res.x) res = vec2(d, 22.0);

    // Camada 2 do bolo
    d = sdVerticalCylinder(p - vec3(0, -layer2Height/2.0, 0), layer2Height/2.0, layer2Radius);
    if (d < res.x) res = vec2(d, 21.0);

    // Cobertura da camada 2
    d = sdVerticalCylinder(p, coverThickness, layer2Radius + coverThickness);
    if (d < res.x) res = vec2(d, 22.0);

    // Velas
    const int NUM_CANDLES = 5;
    for (int i = 0; i < NUM_CANDLES; i++) {
        float angle = float(i) / float(NUM_CANDLES) * 2.0 * PI;
        float candleRingRadius = layer2Radius * 0.6;
        
        vec3 candlePos = vec3(cos(angle) * candleRingRadius, 0.0, sin(angle) * candleRingRadius);
        vec3 localP_candle = p - candlePos;

        float candleHeight = 0.2 * scale;
        float candleRadius = 0.03 * scale;
        float flameRadius = 0.03 * scale;
        d = sdVerticalCylinder(localP_candle - vec3(0, candleHeight, 0), candleHeight, candleRadius);
        if (d < res.x) res = vec2(d, 23.0);
        
        d = sdSphere(localP_candle, vec4(0, candleHeight * 2.0 + 0.02 * scale, 0, flameRadius));
        if (d < res.x) res = vec2(d, 24.0);
    }

    return res;
}


// Árvore
Surface sdTree(vec3 p, vec3 treePos, float growthFactor) {
    Surface s;
    s.dist = 1e6;
    s.id = -1.0;

    vec3 localP = (p - treePos);

    float trunkHeight = 1.5 * growthFactor;
    float trunkRadius = 0.08 * growthFactor;

    // Tronco da árvore
    float dTrunk = sdVerticalCylinder(localP - vec3(0, 1.2 * growthFactor, 0), trunkHeight, trunkRadius);

    if (dTrunk < s.dist) {
        s.dist = dTrunk;
        s.color = vec3(0.35, 0.2, 0.1);
        s.id = 4.0;
    }

    // Copa da árvore (esferas)
    vec3 foliageCenters[4];
    foliageCenters[0] = vec3(0, 2.5, 0);
    foliageCenters[1] = vec3(0.5, 2.0, 0.3);
    foliageCenters[2] = vec3(-0.4, 2.1, -0.3);
    foliageCenters[3] = vec3(0.3, 1.8, -0.4);

    for (int i = 0; i < 4; i++) {
        vec3 foliageCenterAdjusted = foliageCenters[i];
        foliageCenterAdjusted.y *= growthFactor;

        float dLeaf = sdSphere(localP, vec4(foliageCenterAdjusted, 0.7 * growthFactor));
        if (dLeaf < s.dist) {
            s.dist = dLeaf;
            s.color = vec3(0.15, 0.5, 0.15);
            s.id = 5.0;
        }
    }

    return s;
}



// ====================================================
//            MAPEAMENTO DOS OBJETOS NA CENA
// ====================================================
Surface map(vec3 p) {
    Surface s;
    s.dist = 1e6;
    s.id = -1.0;

    float d;

    // ****************************
    //       ELEFANTE BRANCO
    // ****************************
    float riseSpeed = 0.35;
    float maxY = -1.0;
    float startY = -14.0;
    float cubeY = min(maxY, startY + iTime * riseSpeed);
    vec3 cubePos = vec3(0.0, cubeY, 30.0);
    vec3 cubeSize = vec3(3.7, 10.0, 2.0);

    vec3 localP = p - cubePos;

    float rotationAngle = -0.5;
    mat2 rotationMatrix = mat2(cos(rotationAngle), -sin(rotationAngle), sin(rotationAngle),  cos(rotationAngle));

    localP.xz = rotationMatrix * localP.xz;

    d = sdBox(localP, cubeSize);
    if (d < s.dist) {
        float u = (localP.x + cubeSize.x) / (2.0 * cubeSize.x);
        float v = (localP.y + cubeSize.y) / (2.0 * cubeSize.y);

        vec2 uv = vec2(u, v); 
        vec3 texColor = texture(iChannel2, uv).rgb;

        s.color = texColor;;
        s.id = 6.0;
        s.dist = d;
    }



    // ****************************
    //            LUA
    // ****************************
    float cyclePos = mod(iTime, DAY_DURATION) / DAY_DURATION;
    float nightProgress = clamp((cyclePos - DAY_NIGHT_RATIO) / (1.0 - DAY_NIGHT_RATIO), 0.0, 1.0);
    if (nightProgress > 0.0) {
        float horizonY = -3.5;
        float peakY = 12.0; 
        float arcRadiusX = 22.0;
        float angle = nightProgress * PI;

        vec3 moonPos;
        moonPos.x = cos(angle) * arcRadiusX;
        moonPos.y = mix(horizonY, peakY, sin(angle));
        moonPos.z = 35.0;

        d = sdSphere(p, vec4(moonPos, 1.5));

        if (d < s.dist) {
            s.dist = d;
            s.color = vec3(0.9, 0.9, 0.7);
            s.id = 1.0;
        }
    }

    // ****************************
    //           LIVRO
    // ****************************
    // Parâmetros dos livros
    const int MIN_BOOKS = 1;                    // Número inicial de livros
    const int MAX_BOOKS = 5;                    // Número máximo de livros
    const float BOOK_DENSITY_START_TIME = 3.0;  // Segundo em que a densidade começa a aumentar
    const float BOOK_DENSITY_DURATION = 30.0;   // Duração da transição

    float bookDensityProgress = smoothstep(BOOK_DENSITY_START_TIME, BOOK_DENSITY_START_TIME + BOOK_DENSITY_DURATION, iTime);
    
    int numBooksToRender = int(mix(float(MIN_BOOKS), float(MAX_BOOKS), bookDensityProgress));

    for (int i = 0; i < MAX_BOOKS; i++) {
        float birthTime = BOOK_DENSITY_START_TIME + (float(i) / float(MAX_BOOKS - 1)) * BOOK_DENSITY_DURATION;

        if (iTime < birthTime) continue;

        float localTime = iTime - birthTime;

        float randomVal = fract(sin(float(i) * 127.1) * 43758.5453);

        vec3 coverColor;
        int colorIndex = int(mod(float(i), 4.0));

        if (colorIndex == 0) {
            coverColor = vec3(0.8, 0.1, 0.1); // Vermelho
        } else if (colorIndex == 1) {
            coverColor = vec3(0.1, 0.6, 0.2); // Verde
        } else if (colorIndex == 2) {
            coverColor = vec3(0.9, 0.8, 0.2); // Amarelo
        } else {
            coverColor = vec3(0.1, 0.2, 0.7); // Azul
        }

        // Parâmetros do movimento do livro
        const float TRAVEL_DURATION = 4.0;
        const float TRAVEL_WIDTH = 30.0;
        const float WAVE_SPEED = 2.5;
        const float WAVE_HEIGHT = 0.5;

        float timeOffset = randomVal * TRAVEL_DURATION;
        float timeInCycle = mod(localTime + timeOffset, TRAVEL_DURATION);
        float progress = timeInCycle / TRAVEL_DURATION;

        float startX = TRAVEL_WIDTH / 2.0;
        float endX = -TRAVEL_WIDTH / 2.0;

        float x = mix(startX, endX, progress);
        float y = sin((localTime * (0.8 + randomVal * 0.4)) * WAVE_SPEED) * WAVE_HEIGHT;
        float z = 20.0 + (randomVal - 0.5) * 15.0;

        vec3 bookPos = vec3(x, y, z);

        float bookAngleX = (localTime + timeOffset) * 1.0;
        float bookAngleY = (localTime + timeOffset) * 1.0;
        vec3 localP_book = rotateX(p - bookPos, -bookAngleX);
        localP_book = rotateY(localP_book, -bookAngleY);    

        vec2 bookResult = sdBook(localP_book);
        if (bookResult.x < s.dist) {
            s.dist = bookResult.x;
            s.id = 7.0;

            float faceID = bookResult.y;
            // Verifica se é capa
            if (faceID == 8.0 || faceID == 9.0 || faceID == 10.0) {
                s.color = coverColor;
            }
            // Ou página
            else {
                s.color = vec3(0.95, 0.95, 0.9); // Branco
            }
        }
    }

    
    // ****************************
    //            BOLO
    // ****************************
    // Parâmetros do bolo
    const float CAKE_APPEAR_TIME = 35.0;    // Quando o bolo deve aparecer
    const float CAKE_DROP_DURATION = 6.0;   // Duração da queda dele

    float descentFactor = smoothstep(CAKE_APPEAR_TIME, CAKE_APPEAR_TIME + CAKE_DROP_DURATION, iTime);
    if (descentFactor > 0.0) {
        float startY = 10.0;    // Começa no topo (fora da tela)
        float endY = 0.4;       // Termina próximo ao chão

        float cakeY = mix(startY, endY, descentFactor);
        vec3 cakePos = vec3(0.0, cakeY, 5.0);

        vec3 localP_cake = p - cakePos;

        localP_cake = rotateY(localP_cake, iTime * 1.2);
        localP_cake = rotateX(localP_cake, (PI + 0.1) / 2.0);

        vec2 cakeResult = sdCake(localP_cake);
        if (cakeResult.x < s.dist) {
            s.dist = cakeResult.x;
            s.id = cakeResult.y;
            
            // Prato
            if (s.id == 20.0) {
                s.color = vec3(0.8, 0.8, 0.9);
            } 
            // Camada do bolo
            else if (s.id == 21.0) {
                s.color = vec3(0.85, 0.7, 0.45);
            } 
            // Cobertura do bolo
            else if (s.id == 22.0) {
                s.color = vec3(0.95, 0.9, 0.92);
            } 
            // Vela
            else if (s.id == 23.0) {
                s.color = vec3(0.9, 0.2, 0.2);
            } 
            // Fogo
            else if (s.id == 24.0) {
                s.color = vec3(1.0, 0.7, 0.1) * 1.5;
            }
        }
    }


    // ****************************
    //     PLACA - 20 ANOS EACH
    // ****************************
    // Parâmetros da placa
    const float SIGN_APPEAR_TIME = 35.5;    // Quando a placa deve aparecer
    const float SIGN_DROP_DURATION = 3.0;   // Duração da queda dela


    float signDescentFactor = smoothstep(SIGN_APPEAR_TIME, SIGN_APPEAR_TIME + SIGN_DROP_DURATION, iTime);
    if (signDescentFactor > 0.0) {
        float startY = 12.0;  // Começa no topo (fora da tela)
        float endY = 3.0;     // Termina próximo ao chão

        float signY = mix(startY, endY, signDescentFactor);
        vec3 signPos = vec3(0.0, signY, 10.0);

        vec3 signSize = vec3(6.0, 1.5, 0.1);
        vec3 localP_sign = p - signPos;

        d = sdBox(localP_sign, signSize);
        if (d < s.dist) {
            s.id = 30.0;
            
            vec3 defaultColor = vec3(0.2);

            if (abs(localP_sign.z + signSize.z) < 0.01) {
                float u = (localP_sign.x + signSize.x) / (2.0 * signSize.x);
                float v = (localP_sign.y + signSize.y) / (2.0 * signSize.y);
                vec2 uv = vec2(u, 1.0 - v);

                vec4 texColor = texture(iChannel3, uv);
                if (texColor.a < 0.5) {
                    s.dist = d;
                    s.color = vec3(0.1, 0.1, 0.1);
                } else {
                    s.dist = d;
                    s.color = texColor.rgb;
                }
            } else {
                s.dist = d;
                s.color = defaultColor;
            }
        }
    }


    // Movimento da câmera
    float cameraZ = iTime * SPEED;
    p.z += cameraZ;


    // ****************************
    //         CHÃO - GRAMA
    // ****************************
    d = sdPlane(p);
    if (d < s.dist) {
        vec2 uv = p.xz * 0.2; 
        uv = fract(uv);

        vec3 texColor = texture(iChannel1, uv).rgb;

        vec3 greenTint = vec3(0.05, 0.5, 0.1);
        texColor *= greenTint;

        s.color = texColor;
        s.dist = d;
        s.id = 2.0;
    }


    // ****************************
    //           ESTRADA
    // ****************************
    d = sdRoad(p);
    if (d < s.dist) {
        if (abs(p.x) < 0.09) {
            float stripeCycle = mod(p.z + iTime, 1.4);
            float colorSwitch = step(0.5, stripeCycle);

            s.color = mix(vec3(1.0), vec3(0.1), colorSwitch);
        } else {
            s.color = vec3(0.1);
        }

        s.dist = d;
        s.id = 3.0;
    }


    // ****************************
    //           ÁRVORES
    // ****************************
    // Parâmetros das árvores
    const float TREE_SPACING = 15.0;         // Espaçamento das árvores
    const float TREE_START_Z = 30.0;         // Posição Z inicial em que as árvores devem surgir
    const float TREE_RISE_DISTANCE = 10.0;   // Distância que a árvore leva para crescer completamente
    const int MIN_TREES = 2;                 // Número inicial de árvores a serem renderizadas
    const int MAX_TREES = 25;                // Número máximo de árvores
    const float DENSITY_START_TIME = 3.0;    // Segundo a densidade começa a aumentar
    const float DENSITY_DURATION = 30.0;     // Duração (em segundos) da transição de poucas para muitas árvores
    
    float densityProgress = smoothstep(DENSITY_START_TIME, DENSITY_START_TIME + DENSITY_DURATION, iTime);
    
    int numTreesToRender = int(mix(float(MIN_TREES), float(MAX_TREES), densityProgress));

    for (int i = 0; i < MAX_TREES; i++) {
        if (i >= numTreesToRender) continue;

        float randomOffset = fract(sin(float(i) * 127.1) * 43758.5453) * 10.0;
        float side = (mod(float(i), 2.0) < 1.0) ? -1.0 : 1.0;
        float roadEdge = 1.5;
        float safeMargin = 0.5;

        float xPos = side * (roadEdge + safeMargin + randomOffset);

        float zSpacing = TREE_SPACING * (0.8 + randomOffset * 0.4);
        float treeProgressZ = mod(cameraZ + float(i) * zSpacing, TREE_START_Z);
        float riseFactor = smoothstep(0.0, TREE_RISE_DISTANCE, treeProgressZ);
        float treeGrowthFactor = riseFactor * 1.3;

        float treeY = -1.5;

        float zPos = (TREE_START_Z + cameraZ) - treeProgressZ;

        vec3 treePos = vec3(xPos, treeY, zPos);

        Surface tree = sdTree(p, treePos, treeGrowthFactor);
        if (tree.dist < s.dist) {
            s = tree;
        }
    }

    return s;
}



// ====================================================
//                FUNÇÕES AUXILIARES
// ====================================================
Surface rayMarch(vec3 ro, vec3 rd) {
    float totalDist = 0.0;
    Surface result;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * totalDist;
        Surface s = map(p);

        if (s.dist < MIN_DISTANCE) {
            result = s;
            result.dist = totalDist;

            return result;
        }

        totalDist += s.dist;
        if (totalDist > MAX_DISTANCE) {
            break;
        }
    }

    result.dist = totalDist;
    result.id = -1.0;
    result.color = vec3(0.0);

    return result;
}

vec3 getNormal(vec3 p) {
    float d = map(p).dist;
    vec2 e = vec2(0.01, 0);
    vec3 n = d - vec3(
        map(p - e.xyy).dist,
        map(p - e.yxy).dist,
        map(p - e.yyx).dist
    );

    return normalize(n);
}

float getSunLight(vec3 p, float dayAmount) {
    vec3 sunPosition = vec3(0, mix(5.0, 12.0, dayAmount), -0.3);
    vec3 sunDirection = normalize(sunPosition - p);
    vec3 normalVector = getNormal(p);

    float diffuse = clamp(dot(normalVector, sunDirection), 0.0, 1.0) * mix(0.5, 2.0, dayAmount);

    float shadow = rayMarch(p + normalVector * MIN_DISTANCE * 2.0, sunDirection).dist;
    if (shadow < length(sunPosition - p)) diffuse *= 0.1;

    return diffuse;
}

vec3 getSkyColor(vec3 rd, float dayAmount) {
    float t = clamp(0.5 * (rd.y + 1.0), 0.0, 1.0);
    
    vec3 dayBottom = vec3(0.8, 0.9, 1.0);
    vec3 dayTop = vec3(0.4, 0.7, 1.0);
    
    vec3 nightBottom = vec3(0.05, 0.05, 0.1);
    vec3 nightTop = vec3(0.0, 0.0, 0.03);
    
    vec3 bottomColor = mix(nightBottom, dayBottom, dayAmount);
    vec3 topColor = mix(nightTop, dayTop, dayAmount);
    
    return mix(bottomColor, topColor, t);
}

float getDayNightCycle(float time) {
    float cyclePos = mod(time, DAY_DURATION) / DAY_DURATION;
    float dayAmount = smoothstep(0.0, 0.1, cyclePos) - smoothstep(DAY_NIGHT_RATIO, DAY_NIGHT_RATIO+0.1, cyclePos);

    return dayAmount;
}



// ====================================================
//                 FUNÇÃO PRINCIPAL
// ====================================================
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

    float dayAmount = getDayNightCycle(iTime);
    
    vec3 ro = vec3(0, 0, -1);
    vec3 rd = normalize(vec3(uv.x, uv.y, 1));

    Surface s = rayMarch(ro, rd);

    vec3 color;

    if (s.id < 0.0) {
        color = getSkyColor(rd, dayAmount);
        
        // Estrelas durante a noite
        if (dayAmount < 0.5) {
            float stars = pow(fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453), 200.0);
            stars *= smoothstep(0.1, 0.5, 1.0 - dayAmount * 2.0);

            color += stars * vec3(1.0);
        }
    } else {
        float diffuse = getSunLight(ro + rd * s.dist, dayAmount);
        float ambient = mix(0.2, 0.05, dayAmount);
        
        color = s.color * (diffuse + ambient);
    }

    C = vec4(color, 1.0);
}

