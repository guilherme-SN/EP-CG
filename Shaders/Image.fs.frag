uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform float iTime;
uniform vec4 iMouse;
uniform vec2 iResolution;
uniform int iFrame;
out vec4 C;

const float PI = 3.1459;

const int MAX_STEPS = 100;               // Número máximo de iterações do ray marching
const float MAX_DISTANCE = 80.0;           // Distância máxima que o raio pode percorrer
const float MIN_DISTANCE = 0.01;           // Distância mínima para considerar uma colisão
const float SPEED = 4.0;                   // Velocidade da "câmera" indo para frente

// Parâmetros do ciclo dia/noite
const float DAY_DURATION = 9.0;            // Duração de um ciclo completo dia+noite em segundos
const float DAY_NIGHT_RATIO = 0.5;         // Proporção do ciclo que é dia (0.0 a 1.0)

// Parâmetros das árvores
//const int NUM_TREES = 15;
const float TREE_SPACING = 15.0;
const float TREE_START_Z = 30.0;        // Default = 30.0
const float TREE_RISE_DISTANCE = 10.0;   // Default = 5.0

// --- PARÂMETROS DE DENSIDADE DAS ÁRVORES --- // NOVO
const int MIN_TREES = 2;                 // Número inicial de árvores a serem renderizadas.
const int MAX_TREES = 25;                // Número máximo de árvores quando a densidade for total.
const float DENSITY_START_TIME = 3.0;    // Em que segundo a densidade começa a aumentar.
const float DENSITY_DURATION = 30.0;     // Duração (em segundos) da transição de poucas para muitas árvores.

// Estrutura representando um objeto atingido pelo raio
struct Surface {
    float dist;    // Distância da interseção
    vec3 color;    // Cor do objeto
    float id;      // ID para diferenciar objetos
};

// Função para rotacionar um ponto em torno do eixo X
vec3 rotateX(vec3 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    mat2 m = mat2(c, -s, s, c);
    
    // Aplica a rotação 2D nas coordenadas Y e Z do ponto
    p.yz = m * p.yz;
    
    // Retorna o ponto com o x original e as novas coordenadas yz
    return p;
}

vec3 rotateY(vec3 p, float angle) {
    float s = sin(angle); float c = cos(angle);
    mat2 m = mat2(c, -s, s, c);
    return vec3(m * p.xz, p.y);
}

// SDF (Signed Distance Function) para uma esfera
float sdSphere(vec3 p, vec4 sphere) {
    return length(p - sphere.xyz) - sphere.w;
}

// SDF de um cubo centrado na origem com tamanho dado por "b"
float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// SDF para um plano horizontal
float sdPlane(vec3 p) {
    return p.y + 1.5; // plano em y = -1.5
}

// SDF da estrada, representada como um retângulo achatado
float sdRoad(vec3 p) {
    vec2 size = vec2(1.5, 0.01); // largura e espessura da estrada
    vec2 d = abs(vec2(p.x, p.y + 1.5)) - size;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// SDF de um cilindro vertical (tronco da árvore)
float sdVerticalCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

vec2 sdBook(vec3 p) {
    vec2 res = vec2(1e6, -1.0); // vec2(distancia, id)

    vec3 s = vec3(0.4, 0.7, 0.09); // Metade do tamanho do livro
    float t = 0.001;             // Espessura mínima para uma face

    float d; // Distância temporária

    // Face 1: Capa Frontal (+Z) - ID 1.0
    d = sdBox(p - vec3(0, 0, s.z), vec3(s.x, s.y, t));
    if (d < res.x) { res = vec2(d, 8.0); }

    // Face 2: Capa Traseira (-Z) - ID 2.0
    d = sdBox(p - vec3(0, 0, -s.z), vec3(s.x, s.y, t));
    if (d < res.x) { res = vec2(d, 9.0); }

    // Face 3: Lombada (-X) - ID 3.0
    d = sdBox(p - vec3(-s.x, 0, 0), vec3(t, s.y, s.z));
    if (d < res.x) { res = vec2(d, 10.0); }

    // Face 4: Abertura (+X) - ID 4.0 (Páginas)
    d = sdBox(p - vec3(s.x, 0, 0), vec3(t, s.y, s.z));
    if (d < res.x) { res = vec2(d, 11.0); }

    // Face 5: Topo (+Y) - ID 5.0 (Páginas)
    d = sdBox(p - vec3(0, s.y, 0), vec3(s.x, t, s.z));
    if (d < res.x) { res = vec2(d, 12.0); }

    // Face 6: Base (-Y) - ID 6.0 (Páginas)
    d = sdBox(p - vec3(0, -s.y, 0), vec3(s.x, t, s.z));
    if (d < res.x) { res = vec2(d, 13.0); }

    return res;
}

// Retorna a distância e o ID do material da parte mais próxima do bolo.
vec2 sdCake(vec3 p) {
    vec2 res = vec2(1e6, -1.0);

    // --- Fator de Escala para o Bolo (NOVO) ---
    float scale = 1.5; // Aumenta o tamanho geral em 50%

    // --- Dimensões do Bolo (agora multiplicadas pela escala) ---
    float plateRadius = 1.2 * scale;
    float plateHeight = 0.05 * scale;

    float layer1Radius = 0.9 * scale;
    float layer1Height = 0.4 * scale;
    
    float layer2Radius = 0.6 * scale;
    float layer2Height = 0.3 * scale;

    float frostingThickness = 0.03 * scale;

    // --- 1. O Prato ---
    float d = sdVerticalCylinder(p - vec3(0, -layer1Height - layer2Height - plateHeight, 0), plateHeight, plateRadius);
    if (d < res.x) { res = vec2(d, 20.0); }

    // --- 2. Camada Inferior do Bolo ---
    d = sdVerticalCylinder(p - vec3(0, -layer2Height - layer1Height/2.0, 0), layer1Height/2.0, layer1Radius);
    if (d < res.x) { res = vec2(d, 21.0); }

    // Cobertura da Camada Inferior
    d = sdVerticalCylinder(p - vec3(0, -layer2Height, 0), frostingThickness, layer1Radius + frostingThickness);
    if (d < res.x) { res = vec2(d, 22.0); }

    // --- 3. Camada Superior do Bolo ---
    d = sdVerticalCylinder(p - vec3(0, -layer2Height/2.0, 0), layer2Height/2.0, layer2Radius);
    if (d < res.x) { res = vec2(d, 21.0); }

    // Cobertura da Camada Superior
    d = sdVerticalCylinder(p, frostingThickness, layer2Radius + frostingThickness);
    if (d < res.x) { res = vec2(d, 22.0); }

    // --- 4. Velas ---
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
        if (d < res.x) { res = vec2(d, 23.0); }
        
        d = sdSphere(localP_candle, vec4(0, candleHeight * 2.0 + 0.02 * scale, 0, flameRadius));
        if (d < res.x) { res = vec2(d, 24.0); }
    }

    return res;
}


// Função para gerar uma árvore do tipo 1 com tronco e copa (forma arredondada)
Surface simpleTree(vec3 p, vec3 treePos, float growthFactor) { // Adicionado growthFactor
    Surface s;
    s.dist = 1e6;
    s.id = -1.0;

    vec3 localP = (p - treePos); // Aplica escala

    // Ajustar altura e raio do tronco com base no growthFactor
    float trunkHeight = 1.5 * growthFactor;
    float trunkRadius = 0.08 * growthFactor;

    // Tronco da árvore (mais fino e alto)
    float dTrunk = sdVerticalCylinder(localP - vec3(0, 1.2 * growthFactor, 0), trunkHeight, trunkRadius);

    if (dTrunk < s.dist) {
        s.dist = dTrunk;
        s.color = vec3(0.35, 0.2, 0.1); // marrom mais escuro
        s.id = 4.0;
    }

    // Copa da árvore formada por esferas
    vec3 foliageCenters[4];
    foliageCenters[0] = vec3(0, 2.5, 0);
    foliageCenters[1] = vec3(0.5, 2.0, 0.3);
    foliageCenters[2] = vec3(-0.4, 2.1, -0.3);
    foliageCenters[3] = vec3(0.3, 1.8, -0.4);

    for (int i = 0; i < 4; i++) {
        vec3 foliageCenterAdjusted = foliageCenters[i];
        foliageCenterAdjusted.y *= growthFactor;

        float dLeaf = sdSphere(localP, vec4(foliageCenterAdjusted, 0.7 * growthFactor)); // Ajustado o raio
        if (dLeaf < s.dist) {
            s.dist = dLeaf;
            s.color = vec3(0.15, 0.5, 0.15); // verde mais escuro
            s.id = 5.0;
        }
    }

    return s;
}


// Função para calcular o estado dia/noite (0.0 = noite, 1.0 = dia completo)
float getDayNightCycle(float time) {
    float cyclePos = mod(time, DAY_DURATION) / DAY_DURATION;
    float dayAmount = smoothstep(0.0, 0.1, cyclePos) - 
                     smoothstep(DAY_NIGHT_RATIO, DAY_NIGHT_RATIO+0.1, cyclePos);
    return dayAmount;
}


// Função de mapeamento que calcula a menor distância de p para qualquer objeto
Surface map(vec3 p) {
    Surface s;
    s.dist = 1e6;
    s.id = -1.0;

    float d;
        
    // Cubo no centro, surgindo lentamente do chão
    float riseSpeed = 0.35;
    float maxY = -1.0;
    float startY = -14.0;
    float cubeY = min(maxY, startY + iTime * riseSpeed);
    vec3 cubePos = vec3(0.0, cubeY, 30.0);
    vec3 cubeSize = vec3(3.7, 10.0, 2.0);

    vec3 localP = p - cubePos;

    float rotationAngle = -0.5;
    mat2 rotationMatrix = mat2(cos(rotationAngle), -sin(rotationAngle),
                               sin(rotationAngle),  cos(rotationAngle));

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
        
    // Lógica da Lua
    float cyclePos = mod(iTime, DAY_DURATION) / DAY_DURATION;
    float nightProgress = clamp((cyclePos - DAY_NIGHT_RATIO) / (1.0 - DAY_NIGHT_RATIO), 0.0, 1.0);
    if (nightProgress > 0.0) {
        float horizonY   = -3.5;
        float peakY      = 12.0; 
        float arcRadiusX = 22.0;
        const float PI = 3.14159265359;
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


    // Livro
    // --- PARÂMETROS DE DENSIDADE DOS LIVROS (NOVO) ---
    const int MIN_BOOKS = 1;         // Número inicial de livros na tela.
    const int MAX_BOOKS = 5;        // Número máximo de livros com densidade total.
    const float BOOK_DENSITY_START_TIME = 3.0;  // Segundo em que a densidade começa a aumentar.
    const float BOOK_DENSITY_DURATION = 30.0; // Duração da transição.

    // 1. Calcula o progresso da densidade dos livros (de 0.0 a 1.0)
    float bookDensityProgress = smoothstep(BOOK_DENSITY_START_TIME, BOOK_DENSITY_START_TIME + BOOK_DENSITY_DURATION, iTime);
    
    // 2. Calcula quantos livros devem ser renderizados neste frame
    int numBooksToRender = int(mix(float(MIN_BOOKS), float(MAX_BOOKS), bookDensityProgress));


    // --- LOOP PARA RENDERIZAR MÚLTIPLOS LIVROS (NOVO) ---
    for (int i = 0; i < MAX_BOOKS; i++) {

        // 1. CALCULA o tempo exato em que o livro 'i' deve nascer.
        // Distribui os nascimentos uniformemente ao longo da DURAÇÃO da densidade.
        float birthTime = BOOK_DENSITY_START_TIME + (float(i) / float(MAX_BOOKS - 1)) * BOOK_DENSITY_DURATION;

        // 2. VERIFICA se o tempo atual já passou do tempo de nascimento deste livro.
        // Se não, o livro ainda não existe, então pulamos para o próximo.
        if (iTime < birthTime) continue;

        // 3. CALCULA o "tempo de vida" ou "cronômetro pessoal" do livro.
        // Ele sempre começa em 0.0 no momento do nascimento.
        float localTime = iTime - birthTime;


        // Gera um valor aleatório único para cada livro (0.0 a 1.0)
        // Isso garante que cada livro tenha um comportamento ligeiramente diferente.
        float randomVal = fract(sin(float(i) * 127.1) * 43758.5453);

         // --- Seleção de Cor da Capa (NOVO) ---
        vec3 coverColor;
        int colorIndex = int(mod(float(i), 4.0)); // Gera uma sequência: 0, 1, 2, 3, 0, 1, 2...

        if (colorIndex == 0) {
            coverColor = vec3(0.8, 0.1, 0.1); // Vermelho
        } else if (colorIndex == 1) {
            coverColor = vec3(0.1, 0.6, 0.2); // Verde
        } else if (colorIndex == 2) {
            coverColor = vec3(0.9, 0.8, 0.2); // Amarelo
        } else {
            coverColor = vec3(0.1, 0.2, 0.7); // Azul (o original)
        }

        // --- MOVIMENTO DO LIVRO 'i' ---
        const float TRAVEL_DURATION = 4.0;
        const float TRAVEL_WIDTH = 30.0;
        const float BOBBING_SPEED = 2.5;
        const float BOBBING_HEIGHT = 0.5;

        // Usa o valor aleatório para dar a cada livro um "start time" diferente no ciclo.
        // Assim, eles não se movem todos juntos em uma linha perfeita.
        float timeOffset = randomVal * TRAVEL_DURATION;
        float timeInCycle = mod(localTime + timeOffset, TRAVEL_DURATION);
        float progress = timeInCycle / TRAVEL_DURATION;

        // Calcula a posição X
        float startX = TRAVEL_WIDTH / 2.0;
        float endX = -TRAVEL_WIDTH / 2.0;
        float x = mix(startX, endX, progress);

        // Calcula a posição Y, com uma variação aleatória na altura base e velocidade
        float y = sin((localTime * (0.8 + randomVal * 0.4)) * BOBBING_SPEED) * BOBBING_HEIGHT;

        // Varia a profundidade (Z) de cada livro para que passem em planos diferentes
        float z = 20.0 + (randomVal - 0.5) * 15.0;

        vec3 bookPos = vec3(x, y, z);

        // O resto da lógica de SDF e rotação que já tínhamos, agora dentro do loop
        float bookAngleX = (localTime + timeOffset) * 1.0;
        float bookAngleY = (localTime + timeOffset) * 1.0;
        vec3 localP_book = rotateX(p - bookPos, -bookAngleX);
        localP_book = rotateY(localP_book, -bookAngleY);    

        // 1. Chamamos a nova função que testa as 6 faces individualmente
        vec2 bookResult = sdBook(localP_book);

        if (bookResult.x < s.dist) {
            s.dist = bookResult.x;
            s.id = 7.0; // ID geral para o objeto livro

            // 2. Colorimos com base no ID da FACE retornado pela função
            float faceID = bookResult.y;

            // IDs 1.0 (Frente), 2.0 (Traseira) e 3.0 (Lombada) são azuis.
            if (faceID == 8.0 || faceID == 9.0 || faceID == 10.0) {
                s.color = coverColor; // MODIFICADO
            }
            // Todas as outras faces (4.0, 5.0, 6.0) são brancas.
            else {
                s.color = vec3(0.95, 0.95, 0.9); // Branco (Páginas)
            }
        }
    }

    
    // Bolo
    // --- Parâmetros da Animação do Bolo ---
    const float CAKE_APPEAR_TIME = 35.0; 
    const float CAKE_DROP_DURATION = 6.0;

    float descentFactor = smoothstep(CAKE_APPEAR_TIME, CAKE_APPEAR_TIME + CAKE_DROP_DURATION, iTime);

    if (descentFactor > 0.0) {
        // Posição inicial (no céu) e final (no meio da tela)
        float startY = 10.0; // Posição inicial bem alta
        float endY = 2.0;    // ALTERADO: Posição final mais alta, no "meio"

        float cakeY = mix(startY, endY, descentFactor);
        vec3 cakePos = vec3(0.0, cakeY, 15.0);

        vec3 localP_cake = p - cakePos;

        // --- CORREÇÃO DE ROTAÇÃO ---
        
        // Rotação suave em torno de seu próprio eixo Y
        localP_cake = rotateY(localP_cake, iTime * 1.2);

        // NOVO: Rotaciona o bolo 90 graus no eixo X para deixá-lo "em pé" corretamente.
        localP_cake = rotateX(localP_cake, (PI + 0.1) / 2.0);

        vec2 cakeResult = sdCake(localP_cake);

        if (cakeResult.x < s.dist) {
            s.dist = cakeResult.x;
            s.id = cakeResult.y; // O ID do material (prato, massa, cobertura...)
            
            // --- Coloração do Bolo ---
            if (s.id == 20.0) {       // Prato
                s.color = vec3(0.8, 0.8, 0.9);
            } else if (s.id == 21.0) { // Massa do bolo
                s.color = vec3(0.85, 0.7, 0.45);
            } else if (s.id == 22.0) { // Cobertura
                s.color = vec3(0.95, 0.9, 0.92); // Cobertura branca
            } else if (s.id == 23.0) { // Cera da Vela
                s.color = vec3(0.9, 0.2, 0.2); // Vela vermelha
            } else if (s.id == 24.0) { // Chama
                s.color = vec3(1.0, 0.7, 0.1) * 1.5; // Laranja/amarelo brilhante
            }
        }
    }


    // Movimento da câmera
    float cameraZ = iTime * SPEED;
    p.z += cameraZ;

    // Plano verde
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

    // Estrada cinza com listras brancas
    d = sdRoad(p);
    if (d < s.dist) {
        if (abs(p.x) < 0.09) {
            float zStripe = mod(p.z + iTime, 1.4);
            float stripeMask = step(0.5, zStripe);
            s.color = mix(vec3(1.0), vec3(0.1), stripeMask);
        } else {
            s.color = vec3(0.1);
        }
        s.dist = d;
        s.id = 3.0;
    }


    // --- LÓGICA DE DENSIDADE DAS ÁRVORES --- // NOVO
    // 1. Calcula o progresso da transição de densidade (de 0.0 a 1.0).
    float densityProgress = smoothstep(DENSITY_START_TIME, DENSITY_START_TIME + DENSITY_DURATION, iTime);
    
    // 2. Calcula o número de árvores a renderizar neste frame, interpolando entre o mínimo e o máximo.
    int numTreesToRender = int(mix(float(MIN_TREES), float(MAX_TREES), densityProgress));
        
    // Árvores com surgimento suave e densidade progressiva
    // ALTERADO: O loop agora itera até o máximo possível de árvores.
    for (int i = 0; i < MAX_TREES; i++) {
    
        // ALTERADO: Pula a iteração se o índice 'i' for maior que o número de árvores a renderizar.
        if (i >= numTreesToRender) continue;
        
        float randomOffset = fract(sin(float(i) * 127.1) * 43758.5453) * 10.0;
        float side = (mod(float(i), 2.0) < 1.0) ? -1.0 : 1.0;
        float roadEdge = 1.5;
        float safeMargin = 0.5;
        float xPos = side * (roadEdge + safeMargin + randomOffset);

        // --- LÓGICA DE SURGIMENTO ---
        float zSpacing = TREE_SPACING * (0.8 + randomOffset * 0.4);
        float treeProgressZ = mod(cameraZ + float(i) * zSpacing, TREE_START_Z);
        float riseFactor = smoothstep(0.0, TREE_RISE_DISTANCE, treeProgressZ);
        float treeGrowthFactor = riseFactor * 1.3;
        float treeY = -1.5; // A base da árvore estará no chão
        float zPos = (TREE_START_Z + cameraZ) - treeProgressZ;
        vec3 treePos = vec3(xPos, treeY, zPos);
        // --- FIM DA LÓGICA ---

        // Passar o growthFactor para a função simpleTree
        Surface tree = simpleTree(p, treePos, treeGrowthFactor);
        if (tree.dist < s.dist) {
            s = tree;
        }
    }

    return s;
}


// Algoritmo principal de ray marching
Surface rayMarch(vec3 ro, vec3 rd) {
    float totalDist = 0.0;
    Surface result;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * totalDist;
        Surface s = map(p);

        if (s.dist < MIN_DISTANCE) {
            // Raio colidiu com objeto
            result = s;
            result.dist = totalDist;
            return result;
        }

        totalDist += s.dist;

        if (totalDist > MAX_DISTANCE) {
            // Raio não colidiu com nenhum objeto visível
            break;
        }
    }

    // Retorna fundo/“céu”
    result.dist = totalDist;
    result.id = -1.0;
    result.color = vec3(0.0); // preto por padrão

    return result;
}

// Calcula normal aproximada via diferenças centrais
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

// Calcula luz difusa com base em uma fonte pontual
float getLight(vec3 p) {
    vec3 lightPos = vec3(5, 5, 10); // posição da luz

    vec3 l = normalize(lightPos - p); // vetor da luz
    vec3 n = getNormal(p);            // normal da superfície

    float diff = clamp(dot(l, n), 0.0, 1.0) * 1.5; // intensidade da luz

    // Cálculo de sombra
    float shadow = rayMarch(p + n * MIN_DISTANCE * 2.0, l).dist;
    if (shadow < length(lightPos - p)) diff *= 0.1;

    return diff;
}


// Outra fonte de luz (sol no céu) - agora com ciclo dia/noite
float getSunLight(vec3 p, float dayAmount) {
    vec3 sunPosition = vec3(0, mix(5.0, 12.0, dayAmount), -0.3); // posição do sol/lua
    vec3 sunDirection = normalize(sunPosition - p);
    vec3 normalVector = getNormal(p);

    float diffuse = clamp(dot(normalVector, sunDirection), 0.0, 1.0) * 
                   mix(0.5, 2.0, dayAmount);

    float shadow = rayMarch(p + normalVector * MIN_DISTANCE * 2.0, sunDirection).dist;
    if (shadow < length(sunPosition - p)) diffuse *= 0.1;

    return diffuse;
}

// Cor do céu baseada no ângulo do raio (gradiente vertical) - agora com ciclo dia/noite
vec3 skyColor(vec3 rd, float dayAmount) {
    float t = clamp(0.5 * (rd.y + 1.0), 0.0, 1.0);
    
    // Cores para o dia
    vec3 dayBottom = vec3(0.8, 0.9, 1.0);
    vec3 dayTop = vec3(0.4, 0.7, 1.0);
    
    // Cores para a noite
    vec3 nightBottom = vec3(0.05, 0.05, 0.1);
    vec3 nightTop = vec3(0.0, 0.0, 0.03);
    
    // Mistura entre dia e noite
    vec3 bottomColor = mix(nightBottom, dayBottom, dayAmount);
    vec3 topColor = mix(nightTop, dayTop, dayAmount);
    
    return mix(bottomColor, topColor, t);
}

// Função principal que renderiza cada pixel
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

    // Calcula a quantidade de dia (0.0 a 1.0)
    float dayAmount = getDayNightCycle(iTime);
    
    vec3 ro = vec3(0, 0, -1);
    vec3 rd = normalize(vec3(uv.x, uv.y, 1));

    Surface s = rayMarch(ro, rd);

    vec3 color;

    if (s.id < 0.0) {
        // Céu com ciclo dia/noite
        color = skyColor(rd, dayAmount);
        
        // Estrelas durante a noite
        if (dayAmount < 0.5) {
            float stars = pow(fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453), 200.0);
            stars *= smoothstep(0.1, 0.5, 1.0 - dayAmount * 2.0);
            color += stars * vec3(1.0);
        }
    } else {
        // Objetos com iluminação adaptativa
        float diffuse = getSunLight(ro + rd * s.dist, dayAmount);
        float ambient = mix(0.2, 0.05, dayAmount);
        
        color = s.color * (diffuse + ambient);
    }

    C = vec4(color, 1.0);
}
