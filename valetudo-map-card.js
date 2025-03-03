class ValetudoMapCard extends HTMLElement {
  constructor() {
    super();

    this.drawingMap = false;
    this.drawingControls = false;
    this.lastUpdatedControls = "";
    this.attachShadow({ mode: 'open' });
    this.lastMapPoll = new Date(0);
    this.isPollingMap = false;
    this.lastRobotState = "docked";
    this.pollInterval = POLL_INTERVAL_STATE_MAP["cleaning"];

    this.cardContainer = document.createElement('ha-card');
    this.cardContainer.id = 'lovelaceValetudoHaCard';
    this.cardContainerStyle = document.createElement('style');
    this.shadowRoot.appendChild(this.cardContainer);
    this.shadowRoot.appendChild(this.cardContainerStyle);

    this.cardHeader = document.createElement('div');
    this.cardHeader.setAttribute('class', 'card-header');
    this.cardTitle = document.createElement('div');
    this.cardTitle.setAttribute('class', 'name');
    this.cardHeader.appendChild(this.cardTitle);
    this.cardContainer.appendChild(this.cardHeader);

    this.entityWarning1 = document.createElement('hui-warning');
    this.entityWarning1.id = 'lovelaceValetudoWarning1HaCard';
    this.cardContainer.appendChild(this.entityWarning1);

    this.entityWarning2 = document.createElement('hui-warning');
    this.entityWarning2.id = 'lovelaceValetudoWarning2HaCard';
    this.cardContainer.appendChild(this.entityWarning2);

    this.mapContainer = document.createElement('div');
    this.mapContainer.id = 'lovelaceValetudoMapCard';
    this.mapContainerStyle = document.createElement('style');
    this.cardContainer.appendChild(this.mapContainer);
    this.cardContainer.appendChild(this.mapContainerStyle);

    this.controlContainer = document.createElement('div');
    this.controlContainer.id = 'lovelaceValetudoControlCard';
    this.controlContainerStyle = document.createElement('style');
    this.cardContainer.appendChild(this.controlContainer);
    this.cardContainer.appendChild(this.controlContainerStyle);
  };

  shouldDrawMap() {
    return !this.drawingMap;
  };

  shouldDrawControls(state) {
    return !this.drawingControls && this.lastUpdatedControls !== state.last_updated;
  };

  calculateColor(container, ...colors) {
    for (let color of colors) {
      if (!color) continue;
      if (color.startsWith('--')) {
        let possibleColor = getComputedStyle(container).getPropertyValue(color);
        if (!possibleColor) continue;
        return possibleColor;
      }
      return color;
    }
  };

  isOutsideBounds(x, y, drawnMapCanvas, config) {
    return (x < this._config.crop.left) || (x > drawnMapCanvas.width) || (y < config.crop.top) || (y > drawnMapCanvas.height);
  };

  getLayers(attributes, type, maxCount) {
    let layers = [];
    for (let layer of attributes.layers) {
      if (layer.type === type) {
        layers.push(layer);
      }

      if (layers.length === maxCount) {
        break;
      }
    }

    return layers;
  };

  getEntities(attributes, type, maxCount) {
    let entities = [];
    for (let entity of attributes.entities) {
      if (entity.type === type) {
        entities.push(entity);
      }

      if (maxCount && entities.length === maxCount) {
        break;
      }
    }

    return entities;
  };

  getChargerInfo(attributes) {
    let layer = this.getEntities(attributes, 'charger_location', 1)[0];
    if (layer === undefined) {
      return null;
    }

    return [layer.points[0], layer.points[1]];
  };

  getRobotInfo(attributes) {
    let layer = this.getEntities(attributes, 'robot_position', 1)[0];
    if (layer === undefined) {
      return null;
    }

    return [layer.points[0], layer.points[1], layer.metaData.angle];
  };

  getGoToInfo(attributes) {

    let layer = this.getEntities(attributes, 'go_to_target', 1)[0];
    if (layer === undefined) {
      return null;
    }

    return [layer.points[0], layer.points[1]];

  };

  getFloorPoints(attributes, ) {

    let layer = this.getLayers(attributes, 'floor', 1)[0];
    if (layer === undefined) {
      return null;
    }

    return layer.pixels;

  };

  getSegments(attributes) {

    return this.getLayers(attributes, 'segment');

  };

  getWallPoints(attributes) {
    let layer = this.getLayers(attributes, 'wall', 1)[0];
    if (layer === undefined) {
      return null;
    }

    return layer.pixels;
  };

  getVirtualWallPoints(attributes) {
    return this.getEntities(attributes, 'virtual_wall');

  };

  getPathPoints(attributes) {
    let layer = this.getEntities(attributes, 'path', 1)[0];
    if (layer === undefined) {
      return null;
    }

    return layer.points;
  };

  getPredictedPathPoints(attributes) {
    let layer = this.getEntities(attributes, 'predicted_path', 1)[0];
    if (layer === undefined) {
      return null;
    }

    return layer.points;

  };

  getActiveZones(attributes) {
    return this.getEntities(attributes, 'active_zone');
  };

  getNoGoAreas(attributes) {
    return this.getEntities(attributes, 'no_go_area');
  };

  drawMap(mapContainer, attributes, mapHeight, mapWidth, boundingBox, floorColor, wallColor, currentlyCleanedZoneColor, noGoAreaColor, virtualWallColor, pathColor, chargerColor, vacuumColor, gotoTargetColor) {
    // Points to pixels
    let pixelSize = 50;
    pixelSize = attributes.pixelSize;

    const widthScale = pixelSize / this._config.map_scale;
    const heightScale = pixelSize / this._config.map_scale;

    let objectLeftOffset = 0;
    let objectTopOffset = 0;
    let mapLeftOffset = 0;
    let mapTopOffset = 0;

    mapLeftOffset = ((boundingBox.minX) - 1) * this._config.map_scale;
    mapTopOffset = ((boundingBox.minY) - 1) * this._config.map_scale;


    // Create all objects
    const containerContainer = document.createElement('div');
    containerContainer.id = 'lovelaceValetudoCard';

    const drawnMapContainer = document.createElement('div');
    const drawnMapCanvas = document.createElement('canvas');
    drawnMapCanvas.width = mapWidth * this._config.map_scale;
    drawnMapCanvas.height = mapHeight * this._config.map_scale;
    drawnMapContainer.style.zIndex = 1;
    drawnMapContainer.appendChild(drawnMapCanvas);

    const chargerContainer = document.createElement('div');
    const chargerHTML = document.createElement('ha-icon');
    let chargerInfo = this.getChargerInfo(attributes);
    if (this._config.show_dock && chargerInfo) {
      chargerHTML.style.position = 'absolute'; // Needed in Home Assistant 0.110.0 and up
      chargerHTML.icon = this._config.dock_icon || 'mdi:flash';
      chargerHTML.style.left = `${Math.floor(chargerInfo[0] / widthScale) - objectLeftOffset - mapLeftOffset - (12 * this._config.icon_scale)}px`;
      chargerHTML.style.top = `${Math.floor(chargerInfo[1] / heightScale) - objectTopOffset - mapTopOffset - (12 * this._config.icon_scale)}px`;
      chargerHTML.style.color = chargerColor;
      chargerHTML.style.transform = `scale(${this._config.icon_scale}, ${this._config.icon_scale}) rotate(-${this._config.rotate})`;
    };
    chargerContainer.style.zIndex = 2;
    chargerContainer.appendChild(chargerHTML);

    const pathContainer = document.createElement('div');
    const pathCanvas = document.createElement('canvas');
    pathCanvas.width = mapWidth * this._config.map_scale;
    pathCanvas.height = mapHeight * this._config.map_scale;
    pathContainer.style.zIndex = 3;
    pathContainer.appendChild(pathCanvas);

    const vacuumContainer = document.createElement('div');
    const vacuumHTML = document.createElement('ha-icon');

    let robotInfo = this.getRobotInfo(attributes);
    if(!robotInfo) {
      robotInfo = this.lastValidRobotInfo;
    }

    if (this._config.show_vacuum && robotInfo) {
      this.lastValidRobotInfo = robotInfo;
      vacuumHTML.style.position = 'absolute'; // Needed in Home Assistant 0.110.0 and up
      vacuumHTML.icon = this._config.vacuum_icon || 'mdi:robot-vacuum';
      vacuumHTML.style.color = vacuumColor;
      vacuumHTML.style.left = `${Math.floor(robotInfo[0] / widthScale) - objectLeftOffset - mapLeftOffset - (12 * this._config.icon_scale)}px`;
      vacuumHTML.style.top = `${Math.floor(robotInfo[1] / heightScale) - objectTopOffset - mapTopOffset - (12 * this._config.icon_scale)}px`;
      vacuumHTML.style.transform = `scale(${this._config.icon_scale}, ${this._config.icon_scale})`;
    }
    vacuumContainer.style.zIndex = 4;
    vacuumContainer.appendChild(vacuumHTML);

    const goToTargetContainer = document.createElement('div');
    const goToTargetHTML = document.createElement('ha-icon');
    let goToInfo = this.getGoToInfo(attributes);
    if (this._config.show_goto_target && goToInfo) {
      goToTargetHTML.style.position = 'absolute'; // Needed in Home Assistant 0.110.0 and up
      goToTargetHTML.icon = this._config.goto_target_icon || 'mdi:pin';
      goToTargetHTML.style.left = `${Math.floor(goToInfo[0] / widthScale) - objectLeftOffset - mapLeftOffset - (12 * this._config.icon_scale)}px`;
      goToTargetHTML.style.top = `${Math.floor(goToInfo[1] / heightScale) - objectTopOffset - mapTopOffset - (22 * this._config.icon_scale)}px`;
      goToTargetHTML.style.color = gotoTargetColor;
      goToTargetHTML.style.transform = `scale(${this._config.icon_scale}, ${this._config.icon_scale})`;
    }
    goToTargetContainer.style.zIndex = 5;
    goToTargetContainer.appendChild(goToTargetHTML);

    // Put objects in container
    containerContainer.appendChild(drawnMapContainer);
    containerContainer.appendChild(chargerContainer);
    containerContainer.appendChild(pathContainer);
    containerContainer.appendChild(vacuumContainer);
    containerContainer.appendChild(goToTargetContainer);

    const mapCtx = drawnMapCanvas.getContext("2d");
    if (this._config.show_floor) {
      mapCtx.globalAlpha = this._config.floor_opacity;

      mapCtx.strokeStyle = floorColor;
      mapCtx.lineWidth = 1;
      mapCtx.fillStyle = floorColor;
      mapCtx.beginPath();
      let floorPoints = this.getFloorPoints(attributes);
      if (floorPoints) {
        for (let i = 0; i < floorPoints.length; i+=2) {
          let x = (floorPoints[i] * this._config.map_scale) - mapLeftOffset;
          let y = (floorPoints[i + 1] * this._config.map_scale) - mapTopOffset;
          if (this.isOutsideBounds(x, y, drawnMapCanvas, this._config)) continue;
          mapCtx.fillRect(x, y, this._config.map_scale, this._config.map_scale);
        }
      }

      mapCtx.globalAlpha = 1;
    }

    let segmentAreas = this.getSegments(attributes);
    if (segmentAreas && this._config.show_segments) {
      const colorFinder = new FourColorTheoremSolver(segmentAreas, 6);
      mapCtx.globalAlpha = this._config.segment_opacity;

      for (let item of segmentAreas) {
        mapCtx.strokeStyle = this._config.segment_colors[colorFinder.getColor(item.metaData.segmentId)];
        mapCtx.lineWidth = 1;
        mapCtx.fillStyle = this._config.segment_colors[colorFinder.getColor(item.metaData.segmentId)];
        mapCtx.beginPath();
        let segmentPoints = item['pixels'];
        if (segmentPoints) {
          for (let i = 0; i < segmentPoints.length; i+=2) {
            let x = (segmentPoints[i] * this._config.map_scale) - mapLeftOffset;
            let y = (segmentPoints[i + 1] * this._config.map_scale) - mapTopOffset;
            if (this.isOutsideBounds(x, y, drawnMapCanvas, this._config)) continue;
            mapCtx.fillRect(x, y, this._config.map_scale, this._config.map_scale);
          }
        }
      }

      mapCtx.globalAlpha = 1;
    }

    if (this._config.show_walls) {
      mapCtx.globalAlpha = this._config.wall_opacity;

      mapCtx.strokeStyle = wallColor;
      mapCtx.lineWidth = 1;
      mapCtx.fillStyle = wallColor;
      mapCtx.beginPath();
      let wallPoints = this.getWallPoints(attributes);
      if (wallPoints) {
        for (let i = 0; i < wallPoints.length; i+=2) {
          let x = (wallPoints[i] * this._config.map_scale) - mapLeftOffset;
          let y = (wallPoints[i + 1] * this._config.map_scale) - mapTopOffset;
          if (this.isOutsideBounds(x, y, drawnMapCanvas, this._config)) continue;
          mapCtx.fillRect(x, y, this._config.map_scale, this._config.map_scale);
        }
      }

      mapCtx.globalAlpha = 1;
    }

    let activeZones = this.getActiveZones(attributes);
    if (Array.isArray(activeZones) && activeZones.length > 0 && this._config.show_currently_cleaned_zones) {
      mapCtx.globalAlpha = this._config.currently_cleaned_zone_opacity;

      mapCtx.strokeStyle = currentlyCleanedZoneColor;
      mapCtx.lineWidth = 2;
      mapCtx.fillStyle = currentlyCleanedZoneColor;
      for (let item of activeZones) {
        mapCtx.globalAlpha = this._config.currently_cleaned_zone_opacity;
        mapCtx.beginPath();
        let points = item['points'];
        for (let i = 0; i < points.length; i+=2) {
          let x = Math.floor(points[i] / widthScale) - objectLeftOffset - mapLeftOffset;
          let y = Math.floor(points[i + 1] / heightScale) - objectTopOffset - mapTopOffset;
          if (i === 0) {
            mapCtx.moveTo(x, y);
          } else {
            mapCtx.lineTo(x, y);
          }
          if (this.isOutsideBounds(x, y, drawnMapCanvas, this._config)) {
            // noinspection UnnecessaryContinueJS
            continue;
          }
        }
        mapCtx.fill();

        if (this._config.show_currently_cleaned_zones_border) {
          mapCtx.closePath();
          mapCtx.globalAlpha = 1.0;
          mapCtx.stroke();
        }
      }
      mapCtx.globalAlpha = 1.0;
    }

    let noGoAreas = this.getNoGoAreas(attributes);
    if (noGoAreas && this._config.show_no_go_areas) {
      mapCtx.strokeStyle = noGoAreaColor;
      mapCtx.lineWidth = 2;
      mapCtx.fillStyle = noGoAreaColor;
      for (let item of noGoAreas) {
        mapCtx.globalAlpha = this._config.no_go_area_opacity;
        mapCtx.beginPath();
        let points = item['points'];
        for (let i = 0; i < points.length; i+=2) {
          let x = Math.floor(points[i] / widthScale) - objectLeftOffset - mapLeftOffset;
          let y = Math.floor(points[i + 1] / heightScale) - objectTopOffset - mapTopOffset;
          if (i === 0) {
            mapCtx.moveTo(x, y);
          } else {
            mapCtx.lineTo(x, y);
          }
          if (this.isOutsideBounds(x, y, drawnMapCanvas, this._config)) {
            // noinspection UnnecessaryContinueJS
            continue;
          }
        }
        mapCtx.fill();

        if (this._config.show_no_go_area_border) {
          mapCtx.closePath();
          mapCtx.globalAlpha = 1.0;
          mapCtx.stroke();
        }
      }
      mapCtx.globalAlpha = 1.0;
    }

    let virtualWallPoints = this.getVirtualWallPoints(attributes);
    if (virtualWallPoints && this._config.show_virtual_walls && this._config.virtual_wall_width > 0) {
      mapCtx.globalAlpha = this._config.virtual_wall_opacity;

      mapCtx.strokeStyle = virtualWallColor;
      mapCtx.lineWidth = this._config.virtual_wall_width;
      mapCtx.beginPath();
      for (let item of virtualWallPoints) {
        let fromX = Math.floor(item['points'][0] / widthScale) - objectLeftOffset - mapLeftOffset;
        let fromY = Math.floor(item['points'][1] / heightScale) - objectTopOffset - mapTopOffset;
        let toX = Math.floor(item['points'][2] / widthScale) - objectLeftOffset - mapLeftOffset;
        let toY = Math.floor(item['points'][3] / heightScale) - objectTopOffset - mapTopOffset;
        if (this.isOutsideBounds(fromX, fromY, drawnMapCanvas, this._config)) continue;
        if (this.isOutsideBounds(toX, toY, drawnMapCanvas, this._config)) continue;
        mapCtx.moveTo(fromX, fromY);
        mapCtx.lineTo(toX, toY);
        mapCtx.stroke();
      }

      mapCtx.globalAlpha = 1;
    }

    let pathPoints = this.getPathPoints(attributes);
    if (pathPoints) {
      const pathCtx = pathCanvas.getContext("2d");
      pathCtx.globalAlpha = this._config.path_opacity;

      pathCtx.strokeStyle = pathColor;
      pathCtx.lineWidth = this._config.path_width;

      let x = 0;
      let y = 0;
      let first = true;
      pathCtx.beginPath();
      for (let i = 0; i < pathPoints.length; i+=2) {
        x = Math.floor((pathPoints[i]) / widthScale) - objectLeftOffset - mapLeftOffset;
        y = Math.floor((pathPoints[i + 1]) / heightScale) - objectTopOffset - mapTopOffset;
        if (this.isOutsideBounds(x, y, drawnMapCanvas, this._config)) continue;
        if (first) {
          pathCtx.moveTo(x, y);
          first = false;
        } else {
          pathCtx.lineTo(x, y);
        }
      }

      if (this._config.show_path && this._config.path_width > 0) pathCtx.stroke();

      // Update vacuum angle
      vacuumHTML.style.transform = `scale(${this._config.icon_scale}, ${this._config.icon_scale}) rotate(${robotInfo[2]}deg)`;

      pathCtx.globalAlpha = 1;
    }

    let predictedPathPoints = this.getPredictedPathPoints(attributes);
    if (predictedPathPoints) {
      const pathCtx = pathCanvas.getContext("2d");
      pathCtx.globalAlpha = this._config.path_opacity;

      pathCtx.setLineDash([5,3]);
      pathCtx.strokeStyle = pathColor;
      pathCtx.lineWidth = this._config.path_width;

      let x = 0;
      let y = 0;
      let first = true;
      pathCtx.beginPath();
      for (let i = 0; i < predictedPathPoints.length; i+=2) {
        x = Math.floor((predictedPathPoints[i]) / widthScale) - objectLeftOffset - mapLeftOffset;
        y = Math.floor((predictedPathPoints[i + 1]) / heightScale) - objectTopOffset - mapTopOffset;
        if (this.isOutsideBounds(x, y, drawnMapCanvas, this._config)) continue;
        if (first) {
          pathCtx.moveTo(x, y);
          first = false;
        } else {
          pathCtx.lineTo(x, y);
        }
      }

      if (this._config.show_path && this._config.path_width > 0 && this._config.show_predicted_path) pathCtx.stroke();

      pathCtx.globalAlpha = 1;
    }

    // Put our newly generated map in there
    while (mapContainer.firstChild) {
      mapContainer.firstChild.remove();
    }
    mapContainer.appendChild(containerContainer);
  };

  setConfig(config) {
    this._config = Object.assign({}, config);

    // Title settings
    if (this._config.title === undefined) this._config.title = "Vacuum";

    // Show settings
    if (this._config.show_floor === undefined) this._config.show_floor = true;
    if (this._config.show_dock === undefined) this._config.show_dock = true;
    if (this._config.show_vacuum === undefined) this._config.show_vacuum = true;
    if (this._config.show_walls === undefined) this._config.show_walls = true;
    if (this._config.show_currently_cleaned_zones === undefined) this._config.show_currently_cleaned_zones = true;
    if (this._config.show_no_go_areas === undefined) this._config.show_no_go_areas = true;
    if (this._config.show_virtual_walls === undefined) this._config.show_virtual_walls = true;
    if (this._config.show_path === undefined) this._config.show_path = true;
    if (this._config.show_currently_cleaned_zones_border === undefined) this._config.show_currently_cleaned_zones_border = true;
    if (this._config.show_no_go_area_border === undefined) this._config.show_no_go_area_border = true;
    if (this._config.show_predicted_path === undefined) this._config.show_predicted_path = true;
    if (this._config.show_goto_target === undefined) this._config.show_goto_target = true;
    if (this._config.show_segments === undefined) this._config.show_segments = true;
    if (this._config.show_status === undefined) this._config.show_status = true;
    if (this._config.show_battery_level === undefined) this._config.show_battery_level = true;

    // Show button settings
    if (this._config.show_start_button === undefined) this._config.show_start_button = true;
    if (this._config.show_pause_button === undefined) this._config.show_pause_button = true;
    if (this._config.show_stop_button === undefined) this._config.show_stop_button = true;
    if (this._config.show_home_button === undefined) this._config.show_home_button = true;

    // Width settings
    if (this._config.virtual_wall_width === undefined) this._config.virtual_wall_width = 1;
    if (this._config.path_width === undefined) this._config.path_width = 1;

    // Scale settings
    if (this._config.map_scale === undefined) this._config.map_scale = 1;
    if (this._config.icon_scale === undefined) this._config.icon_scale = 1;

    // Opacity settings
    if (this._config.floor_opacity === undefined) this._config.floor_opacity = 1;
    if (this._config.segment_opacity === undefined) this._config.segment_opacity = 0.75;
    if (this._config.wall_opacity === undefined) this._config.wall_opacity = 1;
    if (this._config.currently_cleaned_zone_opacity === undefined) this._config.currently_cleaned_zone_opacity = 0.5;
    if (this._config.no_go_area_opacity === undefined) this._config.no_go_area_opacity = 0.5;
    if (this._config.virtual_wall_opacity === undefined) this._config.virtual_wall_opacity = 1;
    if (this._config.path_opacity === undefined) this._config.path_opacity = 1;

    // Color segment settings
    if (this._config.segment_colors === undefined) this._config.segment_colors = [
      "#19A1A1",
      "#7AC037",
      "#DF5618",
      "#F7C841",
    ];

    // Rotation settings
    if (this._config.rotate === undefined) this._config.rotate = 0;
    if (Number(this._config.rotate)) this._config.rotate = `${this._config.rotate}deg`;

    // Crop settings
    if (this._config.crop !== Object(this._config.crop)) this._config.crop = {};
    if (this._config.crop.top === undefined) this._config.crop.top = 0;
    if (this._config.crop.bottom === undefined) this._config.crop.bottom = 0;
    if (this._config.crop.left === undefined) this._config.crop.left = 0;
    if (this._config.crop.right === undefined) this._config.crop.right = 0;
    if (this._config.min_height === undefined) this._config.min_height = 0;

    // Set card title and hide the header completely if the title is set to an empty value
    if (!this._config.title) {
      this.cardHeader.style.display = 'none';
    } else {
      this.cardHeader.style.display = 'block';
    }
    this.cardTitle.textContent = this._config.title;

    // Set container card background color
    if (this._config.background_color) {
      this.cardContainer.style.background = this._config.background_color;
    } else {
      this.cardContainer.style.background = null;
    }

    if (!Array.isArray(this._config.custom_buttons)) {
      this._config.custom_buttons = [];
    }
  };

  set hass(hass) {
    // Home Assistant 0.110.0 may call this function with undefined sometimes if inside another card
    if (hass === undefined) return;

    this._hass = hass;

    let mapEntity = this._hass.states[this._config.entity];
    let vacuumEntity;
    let shouldForcePoll = false;

    let attributes = mapEntity ? mapEntity.attributes : undefined;

    if(this._config.vacuum_entity && this._hass.states[this._config.vacuum_entity]) {
      vacuumEntity = this._hass.states[this._config.vacuum_entity];


      if (vacuumEntity.state !== this.lastRobotState) {
        this.pollInterval = POLL_INTERVAL_STATE_MAP[vacuumEntity.state] || 10000;
        shouldForcePoll = true;
        this.lastRobotState = vacuumEntity.state;
      }
    }


    if (mapEntity && mapEntity['state'] !== 'unavailable' && attributes && attributes["entity_picture"]) {
      if (new Date().getTime() - this.pollInterval > this.lastMapPoll.getTime() || shouldForcePoll) {
        this.loadImageAndExtractMapData(attributes["entity_picture"]).then(mapData => {
          if (mapData !== null) {
            this.handleDrawing(hass, mapEntity, mapData);
          }
        }).catch(e => {
          this.handleDrawing(hass, mapEntity,{});

          console.warn(e);
        }).finally(() => {
          this.lastMapPoll = new Date();
        });
      }
    }
  };

  async loadImageAndExtractMapData(url) {
    if(this.isPollingMap === false ) {
      this.isPollingMap = true;

      const response = await fetch(url);
      let mapData;

      if(!response.ok) {
        throw new Error("Got error while fetching image " + response.status + " - " + response.statusText);
      }
      const responseData = await response.arrayBuffer();

      const chunks = extractZtxtPngChunks(new Uint8Array(responseData)).filter(c => c.keyword === "ValetudoMap");

      if(chunks.length < 1) {
        throw new Error("No map data found in image");
      }


      mapData = pako.inflate(chunks[0].data, { to: 'string' });
      mapData = JSON.parse(mapData);

      this.isPollingMap = false;
      return mapData;
    } else {
      return null;
    }
  }

  handleDrawing(hass, mapEntity, attributes) {
    const config = this._config;
    let infoEntity = this._hass.states[this._config.vacuum_entity]

    let canDrawMap = false;
    let canDrawControls = true;

    if (attributes.__class === 'ValetudoMap') {
      canDrawMap = true;
    }

    if (!infoEntity || infoEntity['state'] === 'unavailable' || !infoEntity.attributes) {
      canDrawControls = false;
      // Reset last-updated to redraw as soon as element becomes availables
      this.lastUpdatedControls = ""
    }

    if (!canDrawMap && this._config.entity) {
      // Remove the map
      this.mapContainer.style.display = 'none';

      // Show the warning
      this.entityWarning1.textContent = `Entity not available: ${this._config.entity}`;
      this.entityWarning1.style.display = 'block';
    } else {
      this.entityWarning1.style.display = 'none';
      this.mapContainer.style.display = 'block';
    }

    if (!canDrawControls && this._config.vacuum_entity) {
      // Remove the controls
      this.controlContainer.style.display = 'none';

      // Show the warning
      this.entityWarning2.textContent = `Entity not available: ${this._config.vacuum_entity}`;
      this.entityWarning2.style.display = 'block';
    } else {
      this.entityWarning2.style.display = 'none';
      this.controlContainer.style.display = 'block';
    }

    if (canDrawMap) {
      // Calculate map height and width
      let width;
      let height;

      let boundingBox = {
        minX: attributes.size.x / attributes.pixelSize,
        minY: attributes.size.y / attributes.pixelSize,
        maxX: 0,
        maxY: 0
      };

      attributes.layers.forEach(l => {
        if(l.dimensions.x.min < boundingBox.minX) {
          boundingBox.minX = l.dimensions.x.min;
        }
        if(l.dimensions.y.min < boundingBox.minY) {
          boundingBox.minY = l.dimensions.y.min;
        }
        if(l.dimensions.x.max > boundingBox.maxX) {
          boundingBox.maxX = l.dimensions.x.max;
        }
        if(l.dimensions.y.max > boundingBox.maxY) {
          boundingBox.maxY = l.dimensions.y.max;
        }
      })

      width = (boundingBox.maxX - boundingBox.minX) + 2;
      height = (boundingBox.maxY - boundingBox.minY) + 2;

      const mapWidth = width - this._config.crop.right;
      const mapHeight = height - this._config.crop.bottom;

      // Calculate desired container height
      let containerHeight = (mapHeight * this._config.map_scale) - this._config.crop.top
      let minHeight = this._config.min_height;

      // Want height based on container width
      if (String(this._config.min_height).endsWith('w')) {
        minHeight = this._config.min_height.slice(0, -1) * this.mapContainer.offsetWidth;
      }

      let containerMinHeightPadding = minHeight > containerHeight ? (minHeight - containerHeight) / 2 : 0;

      // Set container CSS
      this.mapContainerStyle.textContent = `
        #lovelaceValetudoMapCard {
          height: ${containerHeight}px;
          padding-top: ${containerMinHeightPadding}px;
          padding-bottom: ${containerMinHeightPadding}px;
          overflow: hidden;
        }
        #lovelaceValetudoCard {
          position: relative;
          margin-left: auto;
          margin-right: auto;
          width: ${mapWidth * this._config.map_scale}px;
          height: ${mapHeight * this._config.map_scale}px;
          transform: rotate(${this._config.rotate});
          top: -${this._config.crop.top}px;
          left: -${this._config.crop.left}px;
        }
        #lovelaceValetudoCard div {
          position: absolute;
          background-color: transparent;
          width: 100%;
          height: 100%;
        }
      `
      // Calculate colours
      const homeAssistant = document.getElementsByTagName('home-assistant')[0];
      const floorColor = this.calculateColor(homeAssistant, this._config.floor_color, '--valetudo-map-floor-color', '--secondary-background-color');
      const wallColor = this.calculateColor(homeAssistant, this._config.wall_color, '--valetudo-map-wall-color', '--accent-color');
      const currentlyCleanedZoneColor = this.calculateColor(homeAssistant, this._config.currently_cleaned_zone_color, '--valetudo-currently_cleaned_zone_color', '--secondary-text-color');
      const noGoAreaColor = this.calculateColor(homeAssistant, this._config.no_go_area_color, '--valetudo-no-go-area-color', '--accent-color');
      const virtualWallColor = this.calculateColor(homeAssistant, this._config.virtual_wall_color, '--valetudo-virtual-wall-color', '--accent-color');
      const pathColor = this.calculateColor(homeAssistant, this._config.path_color, '--valetudo-map-path-color', '--primary-text-color');
      const chargerColor = this.calculateColor(homeAssistant, this._config.dock_color, 'green');
      const vacuumColor = this.calculateColor(homeAssistant, this._config.vacuum_color, '--primary-text-color');
      const gotoTargetColor = this.calculateColor(homeAssistant, this._config.goto_target_color, 'blue');

      if (this.shouldDrawMap()) {
        // Start drawing map
        this.drawingMap = true;

        this.drawMap(this.mapContainer, attributes, mapHeight, mapWidth, boundingBox, floorColor, wallColor, currentlyCleanedZoneColor, noGoAreaColor, virtualWallColor, pathColor, chargerColor, vacuumColor, gotoTargetColor);

        this.drawingMap = false;
      }
    }

    // Draw status and controls
    if (canDrawControls) {
      // Set control container CSS
      this.controlContainerStyle.textContent = `
        .flex-box {
          display: flex;
          justify-content: space-evenly;
        }
        paper-button {
          cursor: pointer;
          position: relative;
          display: inline-flex;
          align-items: center;
          padding: 8px;
        }
        ha-icon {
          width: 24px;
          height: 24px;
        }
      `

      let infoEntity = this._hass.states[this._config.vacuum_entity]
      if (this.shouldDrawControls(infoEntity)) {
        // Start drawing controls
        this.drawingControls = true;

        this.infoBox = document.createElement('div');
        this.infoBox.classList.add('flex-box');

        // Default to MQTT status, fall back to Home Assistant Xiaomi status
        let status = null;
        if (infoEntity && infoEntity.attributes && infoEntity.attributes.valetudo_state && infoEntity.attributes.valetudo_state.name) {
          status = infoEntity.attributes.valetudo_state.name;
        } else if (infoEntity && infoEntity.attributes && infoEntity.attributes.status) {
          status = infoEntity.attributes.status;
        }
        if (infoEntity && infoEntity.attributes && infoEntity.attributes.valetudo_state) {
          status = infoEntity.attributes.valetudo_state;
        } else if (infoEntity && infoEntity.attributes && infoEntity.attributes.status) {
          status = infoEntity.attributes.status;
        }

        if (status && this._config.show_status) {
          const statusInfo = document.createElement('p');
          statusInfo.innerHTML = status;
          this.infoBox.appendChild(statusInfo)
        }

        if (infoEntity && infoEntity.attributes && infoEntity.attributes.battery_icon && infoEntity.attributes.battery_level && this._config.show_battery_level) {
          const batteryData = document.createElement('div');
          batteryData.style.display = "flex"
          batteryData.style.alignItems = "center"
          const batteryIcon = document.createElement('ha-icon');
          const batteryText = document.createElement('span');
          batteryIcon.icon = infoEntity.attributes.battery_icon
          batteryText.innerHTML = " " + infoEntity.attributes.battery_level + " %"
          batteryData.appendChild(batteryIcon);
          batteryData.appendChild(batteryText);
          this.infoBox.appendChild(batteryData);
        }

        this.controlFlexBox = document.createElement('div');
        this.controlFlexBox.classList.add('flex-box');

        // Create controls
        if (this._config.show_start_button) {
          const startButton = document.createElement('paper-button');
          const startIcon = document.createElement('ha-icon');
          const startRipple = document.createElement('paper-ripple');
          startIcon.icon = 'mdi:play';
          startButton.appendChild(startIcon);
          startButton.appendChild(startRipple);
          startButton.addEventListener('click', (event) => {
            this._hass.callService('vacuum', 'start', { entity_id: this._config.vacuum_entity }).then();
          });
          this.controlFlexBox.appendChild(startButton);
        }

        if (this._config.show_pause_button) {
          const pauseButton = document.createElement('paper-button');
          const pauseIcon = document.createElement('ha-icon');
          const pauseRipple = document.createElement('paper-ripple');
          pauseIcon.icon = 'mdi:pause';
          pauseButton.appendChild(pauseIcon);
          pauseButton.appendChild(pauseRipple);
          pauseButton.addEventListener('click', (event) => {
            this._hass.callService('vacuum', 'pause', { entity_id: this._config.vacuum_entity }).then();
          });
          this.controlFlexBox.appendChild(pauseButton);
        }

        if (this._config.show_stop_button) {
          const stopButton = document.createElement('paper-button');
          const stopIcon = document.createElement('ha-icon');
          const stopRipple = document.createElement('paper-ripple');
          stopIcon.icon = 'mdi:stop';
          stopButton.appendChild(stopIcon);
          stopButton.appendChild(stopRipple);
          stopButton.addEventListener('click', (event) => {
            this._hass.callService('vacuum', 'stop', { entity_id: this._config.vacuum_entity }).then();
          });
          this.controlFlexBox.appendChild(stopButton);
        }

        if (this._config.show_home_button) {
          const homeButton = document.createElement('paper-button');
          const homeIcon = document.createElement('ha-icon');
          const homeRipple = document.createElement('paper-ripple');
          homeIcon.icon = 'hass:home-map-marker';
          homeButton.appendChild(homeIcon);
          homeButton.appendChild(homeRipple);
          homeButton.addEventListener('click', (event) => {
            this._hass.callService('vacuum', 'return_to_base', { entity_id: this._config.vacuum_entity }).then();
          });
          this.controlFlexBox.appendChild(homeButton);
        }

        this.customControlFlexBox = document.createElement('div');
        this.customControlFlexBox.classList.add('flex-box');

        for (let i = 0; i < this._config.custom_buttons.length; i++) {
          let custom_button = this._config.custom_buttons[i];
          if (custom_button === Object(custom_button) && custom_button.service && custom_button.service.includes('.')) {
            const customButton = document.createElement('paper-button');
            const customButtonIcon = document.createElement('ha-icon');
            const customButtonRipple = document.createElement('paper-ripple');
            customButtonIcon.icon = custom_button["icon"] || 'mdi:radiobox-blank';
            customButton.appendChild(customButtonIcon);
            if (custom_button.text) {
              const customButtonText = document.createElement('span');
              customButtonText.textContent = custom_button.text;
              customButton.appendChild(customButtonText);
            }
            customButton.appendChild(customButtonRipple);
            customButton.addEventListener('click', (event) => {
              const args = custom_button["service"].split('.');
              if (custom_button.service_data) {
                this._hass.callService(args[0], args[1], custom_button.service_data).then();
              } else {
                this._hass.callService(args[0], args[1]).then();
              }
            });
            this.customControlFlexBox.appendChild(customButton);
          }
        }

        // Replace existing controls
        while (this.controlContainer.firstChild) {
          this.controlContainer.firstChild.remove();
        }
        this.controlContainer.append(this.infoBox);
        this.controlContainer.append(this.controlFlexBox);
        this.controlContainer.append(this.customControlFlexBox);

        // Done drawing controls
        this.lastUpdatedControls = infoEntity.last_updated;
        this.drawingControls = false;
      }
    }
  }

  getCardSize() {
    return 1;
  };
}

customElements.define('valetudo-map-card', ValetudoMapCard);

/**
 * This class (FourColorTheoremSolver) is taken from https://github.com/Hypfer/Valetudo/blob/890120c76930bb8941459a7e0d1baa0af8577d83/client/zone/js-modules/map-color-finder.js under the Apache 2 license.
 * See https://github.com/Hypfer/Valetudo/blob/890120c76930bb8941459a7e0d1baa0af8577d83/LICENSE for more information.
 **/
class FourColorTheoremSolver {

  /**
   * This class determines how to color the different map segments contained in the given layers object.
   * The resulting color mapping will ensure that no two adjacent segments share the same color.
   * The map is evaluated row-by-row and column-by-column in order to find every pair of segments that are in "line of sight" of each other.
   * Each pair of segments is then represented as an edge in a graph where the vertices represent the segments themselves.
   * We then use a simple greedy algorithm to color all vertices so that none of its edges connect it to a vertex with the same color.
   * @param {Array<object>} layers - the data containing the map image (array of pixel offsets)
   * @param {number} resolution - Minimal resolution of the map scanner in pixels. Any number higher than one will lead to this many pixels being skipped when finding segment boundaries.
   * For example: If the robot measures 30cm in length/width, this should be set to 6, as no room can be smaller than 6 pixels. This of course implies that a pixel represents 5cm in the real world.
   */
  constructor(layers, resolution) {
    const prec = Math.floor(resolution);
    this.stepFunction = function (c) {
      return c + prec;
    };
    var preparedLayers = this.preprocessLayers(layers);
    if (preparedLayers !== undefined) {
      var mapData = this.createPixelToSegmentMapping(preparedLayers);
      this.areaGraph = this.buildGraph(mapData);
      this.areaGraph.colorAllVertices();
    }
  }

  /**
   * @param {number} segmentId - ID of the segment you want to get the color for.
   * The segment ID is extracted from the layer meta data in the first contructor parameter of this class.
   * @returns {number} The segment color, represented as an integer. Starts at 0 and goes up the minimal number of colors required to color the map without collisions.
   */
  getColor(segmentId) {
    if (this.areaGraph === undefined) {
      // Layer preprocessing seems to have failed. Just return a default value for any input.
      return 0;
    }

    var segmentFromGraph = this.areaGraph.getById(segmentId);
    if (segmentFromGraph) {
      return segmentFromGraph.color;
    } else {
      return 0;
    }
  }

  preprocessLayers(layers) {
    var internalSegments = [];
    var boundaries = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    };
    const filteredLayers = layers.filter(layer => layer.type === "segment");
    if (filteredLayers.length <= 0) {
      return undefined;
    }
    filteredLayers.forEach(layer => {
      var allPixels = [];
      for (let index = 0; index < layer.pixels.length - 1; index += 2) {
        var p = {
          x: layer.pixels[index],
          y: layer.pixels[index + 1]
        };
        this.setBoundaries(boundaries, p);
        allPixels.push(p);
      }
      internalSegments.push({
        segmentId: layer.metaData.segmentId,
        pixels: allPixels
      });
    });
    return {
      boundaries: boundaries,
      segments: internalSegments
    };
  }

  setBoundaries(res, pixel) {
    if (pixel.x < res.minX) {
      res.minX = pixel.x;
    }
    if (pixel.y < res.minY) {
      res.minY = pixel.y;
    }
    if (pixel.x > res.maxX) {
      res.maxX = pixel.x;
    }
    if (pixel.y > res.maxY) {
      res.maxY = pixel.y;
    }
  }

  createPixelToSegmentMapping(preparedLayers) {
    var pixelData = this.create2DArray(
        preparedLayers.boundaries.maxX + 1,
        preparedLayers.boundaries.maxY + 1
    );
    var segmentIds = [];
    preparedLayers.segments.forEach(seg => {
      segmentIds.push(seg.segmentId);
      seg.pixels.forEach(p => {
        pixelData[p.x][p.y] = seg.segmentId;
      });
    });
    return {
      map: pixelData,
      segmentIds: segmentIds,
      boundaries: preparedLayers.boundaries
    };
  }

  buildGraph(mapData) {
    var vertices = mapData.segmentIds.map(i => new MapAreaVertex(i));
    var graph = new MapAreaGraph(vertices);
    this.traverseMap(mapData.boundaries, mapData.map, (x, y, currentSegmentId, pixelData) => {
      var newSegmentId = pixelData[x][y];
      graph.connectVertices(currentSegmentId, newSegmentId);
      return newSegmentId !== undefined ? newSegmentId : currentSegmentId;
    });
    return graph;
  }

  traverseMap(boundaries, pixelData, func) {
    // row-first traversal
    for (let y = boundaries.minY; y <= boundaries.maxY; y = this.stepFunction(y)) {
      var rowFirstSegmentId = undefined;
      for (let x = boundaries.minX; x <= boundaries.maxX; x = this.stepFunction(x)) {
        rowFirstSegmentId = func(x, y, rowFirstSegmentId, pixelData);
      }
    }
    // column-first traversal
    for (let x = boundaries.minX; x <= boundaries.maxX; x = this.stepFunction(x)) {
      var colFirstSegmentId = undefined;
      for (let y = boundaries.minY; y <= boundaries.maxY; y = this.stepFunction(y)) {
        colFirstSegmentId = func(x, y, colFirstSegmentId, pixelData);
      }
    }
  }

  /**
   * Credit for this function goes to the authors of this StackOverflow answer: https://stackoverflow.com/a/966938
   */
  create2DArray(length) {
    var arr = new Array(length || 0),
        i = length;
    if (arguments.length > 1) {
      var args = Array.prototype.slice.call(arguments, 1);
      while (i--) {
        arr[length - 1 - i] = this.create2DArray.apply(this, args);
      }
    }
    return arr;
  }
}

/**
 * This class (MapAreaVertex) is taken from https://github.com/Hypfer/Valetudo/blob/890120c76930bb8941459a7e0d1baa0af8577d83/client/zone/js-modules/map-color-finder.js under the Apache 2 license.
 * See https://github.com/Hypfer/Valetudo/blob/890120c76930bb8941459a7e0d1baa0af8577d83/LICENSE for more information.
 **/
class MapAreaVertex {
  constructor(id) {
    this.id = id;
    this.adjacentVertexIds = new Set();
    this.color = undefined;
  }

  appendVertex(vertexId) {
    if (vertexId !== undefined) {
      this.adjacentVertexIds.add(vertexId);
    }
  }
}

/**
 * This class (MapAreaGraph) is taken from https://github.com/Hypfer/Valetudo/blob/890120c76930bb8941459a7e0d1baa0af8577d83/client/zone/js-modules/map-color-finder.js under the Apache 2 license.
 * See https://github.com/Hypfer/Valetudo/blob/890120c76930bb8941459a7e0d1baa0af8577d83/LICENSE for more information.
 **/
class MapAreaGraph {
  constructor(vertices) {
    this.vertices = vertices;
    this.vertexLookup = new Map();
    this.vertices.forEach(v => {
      this.vertexLookup.set(v.id, v);
    });
  }

  connectVertices(id1, id2) {
    if (id1 !== undefined && id2 !== undefined && id1 !== id2) {
      if (this.vertexLookup.has(id1)) {
        this.vertexLookup.get(id1).appendVertex(id2);
      }
      if (this.vertexLookup.has(id2)) {
        this.vertexLookup.get(id2).appendVertex(id1);
      }
    }
  }

  /**
   * Color the graphs vertices using a greedy algorithm. Any vertices that have already been assigned a color will not be changed.
   * Color assignment will start with the vertex that is connected with the highest number of edges. In most cases, this will
   * naturally lead to a distribution where only four colors are required for the whole graph. This is relevant for maps with a high
   * number of segments, as the naive, greedy algorithm tends to require a fifth color when starting coloring in a segment far from the map's center.
   */
  colorAllVertices() {
    this.vertices.sort((l, r) => r.adjacentVertexIds.size - l.adjacentVertexIds.size)
        .forEach(v => {
          if (v.adjacentVertexIds.size <= 0) {
            v.color = 0;
          } else {
            var adjs = this.getAdjacentVertices(v);
            var existingColors = adjs
                .filter(vert => vert.color !== undefined)
                .map(vert => vert.color);
            v.color = this.lowestColor(existingColors);
          }
        });
  }

  getAdjacentVertices(vertex) {
    return Array.from(vertex.adjacentVertexIds).map(id => this.getById(id));
  }

  getById(id) {
    return this.vertices.find(v => v.id === id);
  }

  lowestColor(colors) {
    if (colors.length <= 0) {
      return 0;
    }
    for (let index = 0; index < colors.length + 1; index++) {
      if (!colors.includes(index)) {
        return index;
      }
    }
  }
}

/**
 * This has been adapted for this use-case from https://github.com/hughsk/png-chunks-extract/blob/d098d583f3ab3877c1e4613ec9353716f86e2eec/index.js
 *
 * See https://github.com/hughsk/png-chunks-extract/blob/d098d583f3ab3877c1e4613ec9353716f86e2eec/LICENSE.md for more information.
 */

function extractZtxtPngChunks (data) {
  // Used for fast-ish conversion between uint8s and uint32s/int32s.
  // Also required in order to remain agnostic for both Node Buffers and
  // Uint8Arrays.
  var uint8 = new Uint8Array(4)
  var uint32 = new Uint32Array(uint8.buffer)


  if (data[0] !== 0x89) throw new Error('Invalid .png file header')
  if (data[1] !== 0x50) throw new Error('Invalid .png file header')
  if (data[2] !== 0x4E) throw new Error('Invalid .png file header')
  if (data[3] !== 0x47) throw new Error('Invalid .png file header')
  if (data[4] !== 0x0D) throw new Error('Invalid .png file header: possibly caused by DOS-Unix line ending conversion?')
  if (data[5] !== 0x0A) throw new Error('Invalid .png file header: possibly caused by DOS-Unix line ending conversion?')
  if (data[6] !== 0x1A) throw new Error('Invalid .png file header')
  if (data[7] !== 0x0A) throw new Error('Invalid .png file header: possibly caused by DOS-Unix line ending conversion?')

  var ended = false
  var chunks = []
  var idx = 8

  while (idx < data.length) {
    // Read the length of the current chunk,
    // which is stored as a Uint32.
    uint8[3] = data[idx++]
    uint8[2] = data[idx++]
    uint8[1] = data[idx++]
    uint8[0] = data[idx++]

    // Chunk includes name/type for CRC check (see below).
    var length = uint32[0] + 4
    var chunk = new Uint8Array(length)
    chunk[0] = data[idx++]
    chunk[1] = data[idx++]
    chunk[2] = data[idx++]
    chunk[3] = data[idx++]

    // Get the name in ASCII for identification.
    var name = (
        String.fromCharCode(chunk[0]) +
        String.fromCharCode(chunk[1]) +
        String.fromCharCode(chunk[2]) +
        String.fromCharCode(chunk[3])
    )

    // The IEND header marks the end of the file,
    // so on discovering it break out of the loop.
    if (name === 'IEND') {
      ended = true

      break
    }

    // Read the contents of the chunk out of the main buffer.
    for (var i = 4; i < length; i++) {
      chunk[i] = data[idx++]
    }

    //Skip the CRC32
    idx += 4;

    // The chunk data is now copied to remove the 4 preceding
    // bytes used for the chunk name/type.
    var chunkData = new Uint8Array(chunk.buffer.slice(4))

    if(name === "zTXt") {
      let i = 0;
      let keyword = "";

      while(chunkData[i] !== 0 && i < 79 ) {
        keyword += String.fromCharCode(chunkData[i]);

        i++;
      }

      chunks.push({
        keyword: keyword,
        data: new Uint8Array(chunkData.slice(i + 2))
      });
    }
  }

  if (!ended) {
    throw new Error('.png file ended prematurely: no IEND header was found')
  }

  return chunks
}

const POLL_INTERVAL_STATE_MAP = {
  "cleaning": 3*1000,
  "paused": 15*1000,
  "idle": 2*60*1000,
  "returning": 3*1000,
  "docked": 2*60*1000,
  "error": 2*60*1000
}


/**
 * This is pako_inflate.min.js taken from https://github.com/nodeca/pako/blob/c715679bfdc3f15faba6628c2311ca7dc6bfeb7f/dist/pako_inflate.min.js
 * See https://github.com/nodeca/pako/blob/c715679bfdc3f15faba6628c2311ca7dc6bfeb7f/LICENSE for more information.
 **/
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).pako=e()}}(function(){return function r(o,s,f){function l(t,e){if(!s[t]){if(!o[t]){var i="function"==typeof require&&require;if(!e&&i)return i(t,!0);if(d)return d(t,!0);var n=new Error("Cannot find module '"+t+"'");throw n.code="MODULE_NOT_FOUND",n}var a=s[t]={exports:{}};o[t][0].call(a.exports,function(e){return l(o[t][1][e]||e)},a,a.exports,r,o,s,f)}return s[t].exports}for(var d="function"==typeof require&&require,e=0;e<f.length;e++)l(f[e]);return l}({1:[function(e,t,i){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Int32Array;i.assign=function(e){for(var t,i,n=Array.prototype.slice.call(arguments,1);n.length;){var a=n.shift();if(a){if("object"!=typeof a)throw new TypeError(a+"must be non-object");for(var r in a)t=a,i=r,Object.prototype.hasOwnProperty.call(t,i)&&(e[r]=a[r])}}return e},i.shrinkBuf=function(e,t){return e.length===t?e:e.subarray?e.subarray(0,t):(e.length=t,e)};var a={arraySet:function(e,t,i,n,a){if(t.subarray&&e.subarray)e.set(t.subarray(i,i+n),a);else for(var r=0;r<n;r++)e[a+r]=t[i+r]},flattenChunks:function(e){var t,i,n,a,r,o;for(t=n=0,i=e.length;t<i;t++)n+=e[t].length;for(o=new Uint8Array(n),t=a=0,i=e.length;t<i;t++)r=e[t],o.set(r,a),a+=r.length;return o}},r={arraySet:function(e,t,i,n,a){for(var r=0;r<n;r++)e[a+r]=t[i+r]},flattenChunks:function(e){return[].concat.apply([],e)}};i.setTyped=function(e){e?(i.Buf8=Uint8Array,i.Buf16=Uint16Array,i.Buf32=Int32Array,i.assign(i,a)):(i.Buf8=Array,i.Buf16=Array,i.Buf32=Array,i.assign(i,r))},i.setTyped(n)},{}],2:[function(e,t,i){"use strict";var f=e("./common"),a=!0,r=!0;try{String.fromCharCode.apply(null,[0])}catch(e){a=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){r=!1}for(var l=new f.Buf8(256),n=0;n<256;n++)l[n]=252<=n?6:248<=n?5:240<=n?4:224<=n?3:192<=n?2:1;function d(e,t){if(t<65534&&(e.subarray&&r||!e.subarray&&a))return String.fromCharCode.apply(null,f.shrinkBuf(e,t));for(var i="",n=0;n<t;n++)i+=String.fromCharCode(e[n]);return i}l[254]=l[254]=1,i.string2buf=function(e){var t,i,n,a,r,o=e.length,s=0;for(a=0;a<o;a++)55296==(64512&(i=e.charCodeAt(a)))&&a+1<o&&56320==(64512&(n=e.charCodeAt(a+1)))&&(i=65536+(i-55296<<10)+(n-56320),a++),s+=i<128?1:i<2048?2:i<65536?3:4;for(t=new f.Buf8(s),a=r=0;r<s;a++)55296==(64512&(i=e.charCodeAt(a)))&&a+1<o&&56320==(64512&(n=e.charCodeAt(a+1)))&&(i=65536+(i-55296<<10)+(n-56320),a++),i<128?t[r++]=i:(i<2048?t[r++]=192|i>>>6:(i<65536?t[r++]=224|i>>>12:(t[r++]=240|i>>>18,t[r++]=128|i>>>12&63),t[r++]=128|i>>>6&63),t[r++]=128|63&i);return t},i.buf2binstring=function(e){return d(e,e.length)},i.binstring2buf=function(e){for(var t=new f.Buf8(e.length),i=0,n=t.length;i<n;i++)t[i]=e.charCodeAt(i);return t},i.buf2string=function(e,t){var i,n,a,r,o=t||e.length,s=new Array(2*o);for(i=n=0;i<o;)if((a=e[i++])<128)s[n++]=a;else if(4<(r=l[a]))s[n++]=65533,i+=r-1;else{for(a&=2===r?31:3===r?15:7;1<r&&i<o;)a=a<<6|63&e[i++],r--;1<r?s[n++]=65533:a<65536?s[n++]=a:(a-=65536,s[n++]=55296|a>>10&1023,s[n++]=56320|1023&a)}return d(s,n)},i.utf8border=function(e,t){var i;for((t=t||e.length)>e.length&&(t=e.length),i=t-1;0<=i&&128==(192&e[i]);)i--;return i<0?t:0===i?t:i+l[e[i]]>t?i:t}},{"./common":1}],3:[function(e,t,i){"use strict";t.exports=function(e,t,i,n){for(var a=65535&e|0,r=e>>>16&65535|0,o=0;0!==i;){for(i-=o=2e3<i?2e3:i;r=r+(a=a+t[n++]|0)|0,--o;);a%=65521,r%=65521}return a|r<<16|0}},{}],4:[function(e,t,i){"use strict";t.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],5:[function(e,t,i){"use strict";var s=function(){for(var e,t=[],i=0;i<256;i++){e=i;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[i]=e}return t}();t.exports=function(e,t,i,n){var a=s,r=n+i;e^=-1;for(var o=n;o<r;o++)e=e>>>8^a[255&(e^t[o])];return-1^e}},{}],6:[function(e,t,i){"use strict";t.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],7:[function(e,t,i){"use strict";t.exports=function(e,t){var i,n,a,r,o,s,f,l,d,c,u,h,b,m,w,k,_,g,v,p,x,y,S,E,Z;i=e.state,n=e.next_in,E=e.input,a=n+(e.avail_in-5),r=e.next_out,Z=e.output,o=r-(t-e.avail_out),s=r+(e.avail_out-257),f=i.dmax,l=i.wsize,d=i.whave,c=i.wnext,u=i.window,h=i.hold,b=i.bits,m=i.lencode,w=i.distcode,k=(1<<i.lenbits)-1,_=(1<<i.distbits)-1;e:do{b<15&&(h+=E[n++]<<b,b+=8,h+=E[n++]<<b,b+=8),g=m[h&k];for(;;){if(h>>>=v=g>>>24,b-=v,0===(v=g>>>16&255))Z[r++]=65535&g;else{if(!(16&v)){if(0==(64&v)){g=m[(65535&g)+(h&(1<<v)-1)];continue;}if(32&v){i.mode=12;break e}e.msg="invalid literal/length code",i.mode=30;break e}p=65535&g,(v&=15)&&(b<v&&(h+=E[n++]<<b,b+=8),p+=h&(1<<v)-1,h>>>=v,b-=v),b<15&&(h+=E[n++]<<b,b+=8,h+=E[n++]<<b,b+=8),g=w[h&_];for(;;){if(h>>>=v=g>>>24,b-=v,!(16&(v=g>>>16&255))){if(0==(64&v)){g=w[(65535&g)+(h&(1<<v)-1)];continue;}e.msg="invalid distance code",i.mode=30;break e}if(x=65535&g,b<(v&=15)&&(h+=E[n++]<<b,(b+=8)<v&&(h+=E[n++]<<b,b+=8)),f<(x+=h&(1<<v)-1)){e.msg="invalid distance too far back",i.mode=30;break e}if(h>>>=v,b-=v,(v=r-o)<x){if(d<(v=x-v)&&i.sane){e.msg="invalid distance too far back",i.mode=30;break e}if(S=u,(y=0)===c){if(y+=l-v,v<p){for(p-=v;Z[r++]=u[y++],--v;);y=r-x,S=Z}}else if(c<v){if(y+=l+c-v,(v-=c)<p){for(p-=v;Z[r++]=u[y++],--v;);if(y=0,c<p){for(p-=v=c;Z[r++]=u[y++],--v;);y=r-x,S=Z}}}else if(y+=c-v,v<p){for(p-=v;Z[r++]=u[y++],--v;);y=r-x,S=Z}for(;2<p;)Z[r++]=S[y++],Z[r++]=S[y++],Z[r++]=S[y++],p-=3;p&&(Z[r++]=S[y++],1<p&&(Z[r++]=S[y++]))}else{for(y=r-x;Z[r++]=Z[y++],Z[r++]=Z[y++],Z[r++]=Z[y++],2<(p-=3););p&&(Z[r++]=Z[y++],1<p&&(Z[r++]=Z[y++]))}break}}break}}while(n<a&&r<s);n-=p=b>>3,h&=(1<<(b-=p<<3))-1,e.next_in=n,e.next_out=r,e.avail_in=n<a?a-n+5:5-(n-a),e.avail_out=r<s?s-r+257:257-(r-s),i.hold=h,i.bits=b}},{}],8:[function(e,t,i){"use strict";var z=e("../utils/common"),R=e("./adler32"),N=e("./crc32"),O=e("./inffast"),C=e("./inftrees"),I=1,D=2,T=0,U=-2,F=1,n=852,a=592;function L(e){return(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24)}function r(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new z.Buf16(320),this.work=new z.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function o(e){var t;return e&&e.state?(t=e.state,e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=F,t.last=0,t.havedict=0,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new z.Buf32(n),t.distcode=t.distdyn=new z.Buf32(a),t.sane=1,t.back=-1,T):U}function s(e){var t;return e&&e.state?((t=e.state).wsize=0,t.whave=0,t.wnext=0,o(e)):U}function f(e,t){var i,n;return e&&e.state?(n=e.state,t<0?(i=0,t=-t):(i=1+(t>>4),t<48&&(t&=15)),t&&(t<8||15<t)?U:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=i,n.wbits=t,s(e))):U}function l(e,t){var i,n;return e?(n=new r,(e.state=n).window=null,(i=f(e,t))!==T&&(e.state=null),i):U}var d,c,u=!0;function H(e){if(u){var t;for(d=new z.Buf32(512),c=new z.Buf32(32),t=0;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(C(I,e.lens,0,288,d,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;C(D,e.lens,0,32,c,0,e.work,{bits:5}),u=!1}e.lencode=d,e.lenbits=9,e.distcode=c,e.distbits=5}function j(e,t,i,n){var a,r=e.state;return null===r.window&&(r.wsize=1<<r.wbits,r.wnext=0,r.whave=0,r.window=new z.Buf8(r.wsize)),n>=r.wsize?(z.arraySet(r.window,t,i-r.wsize,r.wsize,0),r.wnext=0,r.whave=r.wsize):(n<(a=r.wsize-r.wnext)&&(a=n),z.arraySet(r.window,t,i-n,a,r.wnext),(n-=a)?(z.arraySet(r.window,t,i-n,n,0),r.wnext=n,r.whave=r.wsize):(r.wnext+=a,r.wnext===r.wsize&&(r.wnext=0),r.whave<r.wsize&&(r.whave+=a))),0}i.inflateReset=s,i.inflateReset2=f,i.inflateResetKeep=o,i.inflateInit=function(e){return l(e,15)},i.inflateInit2=l,i.inflate=function(e,t){var i,n,a,r,o,s,f,l,d,c,u,h,b,m,w,k,_,g,v,p,x,y,S,E,Z=0,B=new z.Buf8(4),A=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&0!==e.avail_in)return U;12===(i=e.state).mode&&(i.mode=13),o=e.next_out,a=e.output,f=e.avail_out,r=e.next_in,n=e.input,s=e.avail_in,l=i.hold,d=i.bits,c=s,u=f,y=T;e:for(;;)switch(i.mode){case F:if(0===i.wrap){i.mode=13;break}for(;d<16;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(2&i.wrap&&35615===l){B[i.check=0]=255&l,B[1]=l>>>8&255,i.check=N(i.check,B,2,0),d=l=0,i.mode=2;break}if(i.flags=0,i.head&&(i.head.done=!1),!(1&i.wrap)||(((255&l)<<8)+(l>>8))%31){e.msg="incorrect header check",i.mode=30;break}if(8!=(15&l)){e.msg="unknown compression method",i.mode=30;break}if(d-=4,x=8+(15&(l>>>=4)),0===i.wbits)i.wbits=x;else if(x>i.wbits){e.msg="invalid window size",i.mode=30;break}i.dmax=1<<x,e.adler=i.check=1,i.mode=512&l?10:12,d=l=0;break;case 2:for(;d<16;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(i.flags=l,8!=(255&i.flags)){e.msg="unknown compression method",i.mode=30;break}if(57344&i.flags){e.msg="unknown header flags set",i.mode=30;break}i.head&&(i.head.text=l>>8&1),512&i.flags&&(B[0]=255&l,B[1]=l>>>8&255,i.check=N(i.check,B,2,0)),d=l=0,i.mode=3;case 3:for(;d<32;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}i.head&&(i.head.time=l),512&i.flags&&(B[0]=255&l,B[1]=l>>>8&255,B[2]=l>>>16&255,B[3]=l>>>24&255,i.check=N(i.check,B,4,0)),d=l=0,i.mode=4;case 4:for(;d<16;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}i.head&&(i.head.xflags=255&l,i.head.os=l>>8),512&i.flags&&(B[0]=255&l,B[1]=l>>>8&255,i.check=N(i.check,B,2,0)),d=l=0,i.mode=5;case 5:if(1024&i.flags){for(;d<16;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}i.length=l,i.head&&(i.head.extra_len=l),512&i.flags&&(B[0]=255&l,B[1]=l>>>8&255,i.check=N(i.check,B,2,0)),d=l=0}else i.head&&(i.head.extra=null);i.mode=6;case 6:if(1024&i.flags&&(s<(h=i.length)&&(h=s),h&&(i.head&&(x=i.head.extra_len-i.length,i.head.extra||(i.head.extra=new Array(i.head.extra_len)),z.arraySet(i.head.extra,n,r,h,x)),512&i.flags&&(i.check=N(i.check,n,h,r)),s-=h,r+=h,i.length-=h),i.length))break e;i.length=0,i.mode=7;case 7:if(2048&i.flags){if(0===s)break e;for(h=0;x=n[r+h++],i.head&&x&&i.length<65536&&(i.head.name+=String.fromCharCode(x)),x&&h<s;);if(512&i.flags&&(i.check=N(i.check,n,h,r)),s-=h,r+=h,x)break e}else i.head&&(i.head.name=null);i.length=0,i.mode=8;case 8:if(4096&i.flags){if(0===s)break e;for(h=0;x=n[r+h++],i.head&&x&&i.length<65536&&(i.head.comment+=String.fromCharCode(x)),x&&h<s;);if(512&i.flags&&(i.check=N(i.check,n,h,r)),s-=h,r+=h,x)break e}else i.head&&(i.head.comment=null);i.mode=9;case 9:if(512&i.flags){for(;d<16;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(l!==(65535&i.check)){e.msg="header crc mismatch",i.mode=30;break}d=l=0}i.head&&(i.head.hcrc=i.flags>>9&1,i.head.done=!0),e.adler=i.check=0,i.mode=12;break;case 10:for(;d<32;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}e.adler=i.check=L(l),d=l=0,i.mode=11;case 11:if(0===i.havedict)return e.next_out=o,e.avail_out=f,e.next_in=r,e.avail_in=s,i.hold=l,i.bits=d,2;e.adler=i.check=1,i.mode=12;case 12:if(5===t||6===t)break e;case 13:if(i.last){l>>>=7&d,d-=7&d,i.mode=27;break}for(;d<3;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}switch(i.last=1&l,d-=1,3&(l>>>=1)){case 0:i.mode=14;break;case 1:if(H(i),i.mode=20,6!==t)break;l>>>=2,d-=2;break e;case 2:i.mode=17;break;case 3:e.msg="invalid block type",i.mode=30}l>>>=2,d-=2;break;case 14:for(l>>>=7&d,d-=7&d;d<32;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if((65535&l)!=(l>>>16^65535)){e.msg="invalid stored block lengths",i.mode=30;break}if(i.length=65535&l,d=l=0,i.mode=15,6===t)break e;case 15:i.mode=16;case 16:if(h=i.length){if(s<h&&(h=s),f<h&&(h=f),0===h)break e;z.arraySet(a,n,r,h,o),s-=h,r+=h,f-=h,o+=h,i.length-=h;break}i.mode=12;break;case 17:for(;d<14;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(i.nlen=257+(31&l),l>>>=5,d-=5,i.ndist=1+(31&l),l>>>=5,d-=5,i.ncode=4+(15&l),l>>>=4,d-=4,286<i.nlen||30<i.ndist){e.msg="too many length or distance symbols",i.mode=30;break}i.have=0,i.mode=18;case 18:for(;i.have<i.ncode;){for(;d<3;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}i.lens[A[i.have++]]=7&l,l>>>=3,d-=3}for(;i.have<19;)i.lens[A[i.have++]]=0;if(i.lencode=i.lendyn,i.lenbits=7,S={bits:i.lenbits},y=C(0,i.lens,0,19,i.lencode,0,i.work,S),i.lenbits=S.bits,y){e.msg="invalid code lengths set",i.mode=30;break}i.have=0,i.mode=19;case 19:for(;i.have<i.nlen+i.ndist;){for(;k=(Z=i.lencode[l&(1<<i.lenbits)-1])>>>16&255,_=65535&Z,!((w=Z>>>24)<=d);){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(_<16)l>>>=w,d-=w,i.lens[i.have++]=_;else{if(16===_){for(E=w+2;d<E;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(l>>>=w,d-=w,0===i.have){e.msg="invalid bit length repeat",i.mode=30;break}x=i.lens[i.have-1],h=3+(3&l),l>>>=2,d-=2}else if(17===_){for(E=w+3;d<E;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}d-=w,x=0,h=3+(7&(l>>>=w)),l>>>=3,d-=3}else{for(E=w+7;d<E;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}d-=w,x=0,h=11+(127&(l>>>=w)),l>>>=7,d-=7}if(i.have+h>i.nlen+i.ndist){e.msg="invalid bit length repeat",i.mode=30;break}for(;h--;)i.lens[i.have++]=x}}if(30===i.mode)break;if(0===i.lens[256]){e.msg="invalid code -- missing end-of-block",i.mode=30;break}if(i.lenbits=9,S={bits:i.lenbits},y=C(I,i.lens,0,i.nlen,i.lencode,0,i.work,S),i.lenbits=S.bits,y){e.msg="invalid literal/lengths set",i.mode=30;break}if(i.distbits=6,i.distcode=i.distdyn,S={bits:i.distbits},y=C(D,i.lens,i.nlen,i.ndist,i.distcode,0,i.work,S),i.distbits=S.bits,y){e.msg="invalid distances set",i.mode=30;break}if(i.mode=20,6===t)break e;case 20:i.mode=21;case 21:if(6<=s&&258<=f){e.next_out=o,e.avail_out=f,e.next_in=r,e.avail_in=s,i.hold=l,i.bits=d,O(e,u),o=e.next_out,a=e.output,f=e.avail_out,r=e.next_in,n=e.input,s=e.avail_in,l=i.hold,d=i.bits,12===i.mode&&(i.back=-1);break}for(i.back=0;k=(Z=i.lencode[l&(1<<i.lenbits)-1])>>>16&255,_=65535&Z,!((w=Z>>>24)<=d);){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(k&&0==(240&k)){for(g=w,v=k,p=_;k=(Z=i.lencode[p+((l&(1<<g+v)-1)>>g)])>>>16&255,_=65535&Z,!(g+(w=Z>>>24)<=d);){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}l>>>=g,d-=g,i.back+=g}if(l>>>=w,d-=w,i.back+=w,i.length=_,0===k){i.mode=26;break}if(32&k){i.back=-1,i.mode=12;break}if(64&k){e.msg="invalid literal/length code",i.mode=30;break}i.extra=15&k,i.mode=22;case 22:if(i.extra){for(E=i.extra;d<E;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}i.length+=l&(1<<i.extra)-1,l>>>=i.extra,d-=i.extra,i.back+=i.extra}i.was=i.length,i.mode=23;case 23:for(;k=(Z=i.distcode[l&(1<<i.distbits)-1])>>>16&255,_=65535&Z,!((w=Z>>>24)<=d);){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(0==(240&k)){for(g=w,v=k,p=_;k=(Z=i.distcode[p+((l&(1<<g+v)-1)>>g)])>>>16&255,_=65535&Z,!(g+(w=Z>>>24)<=d);){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}l>>>=g,d-=g,i.back+=g}if(l>>>=w,d-=w,i.back+=w,64&k){e.msg="invalid distance code",i.mode=30;break}i.offset=_,i.extra=15&k,i.mode=24;case 24:if(i.extra){for(E=i.extra;d<E;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}i.offset+=l&(1<<i.extra)-1,l>>>=i.extra,d-=i.extra,i.back+=i.extra}if(i.offset>i.dmax){e.msg="invalid distance too far back",i.mode=30;break}i.mode=25;case 25:if(0===f)break e;if(h=u-f,i.offset>h){if((h=i.offset-h)>i.whave&&i.sane){e.msg="invalid distance too far back",i.mode=30;break}h>i.wnext?(h-=i.wnext,b=i.wsize-h):b=i.wnext-h,h>i.length&&(h=i.length),m=i.window}else m=a,b=o-i.offset,h=i.length;for(f<h&&(h=f),f-=h,i.length-=h;a[o++]=m[b++],--h;);0===i.length&&(i.mode=21);break;case 26:if(0===f)break e;a[o++]=i.length,f--,i.mode=21;break;case 27:if(i.wrap){for(;d<32;){if(0===s)break e;s--,l|=n[r++]<<d,d+=8}if(u-=f,e.total_out+=u,i.total+=u,u&&(e.adler=i.check=i.flags?N(i.check,a,u,o-u):R(i.check,a,u,o-u)),u=f,(i.flags?l:L(l))!==i.check){e.msg="incorrect data check",i.mode=30;break}d=l=0}i.mode=28;case 28:if(i.wrap&&i.flags){for(;d<32;){if(0===s)break e;s--,l+=n[r++]<<d,d+=8}if(l!==(4294967295&i.total)){e.msg="incorrect length check",i.mode=30;break}d=l=0}i.mode=29;case 29:y=1;break e;case 30:y=-3;break e;case 31:return-4;case 32:default:return U}return e.next_out=o,e.avail_out=f,e.next_in=r,e.avail_in=s,i.hold=l,i.bits=d,(i.wsize||u!==e.avail_out&&i.mode<30&&(i.mode<27||4!==t))&&j(e,e.output,e.next_out,u-e.avail_out)?(i.mode=31,-4):(c-=e.avail_in,u-=e.avail_out,e.total_in+=c,e.total_out+=u,i.total+=u,i.wrap&&u&&(e.adler=i.check=i.flags?N(i.check,a,u,e.next_out-u):R(i.check,a,u,e.next_out-u)),e.data_type=i.bits+(i.last?64:0)+(12===i.mode?128:0)+(20===i.mode||15===i.mode?256:0),(0===c&&0===u||4===t)&&y===T&&(y=-5),y)},i.inflateEnd=function(e){if(!e||!e.state)return U;var t=e.state;return t.window&&(t.window=null),e.state=null,T},i.inflateGetHeader=function(e,t){var i;return e&&e.state?0==(2&(i=e.state).wrap)?U:((i.head=t).done=!1,T):U},i.inflateSetDictionary=function(e,t){var i,n=t.length;return e&&e.state?0!==(i=e.state).wrap&&11!==i.mode?U:11===i.mode&&R(1,t,n,0)!==i.check?-3:j(e,t,n,n)?(i.mode=31,-4):(i.havedict=1,T):U},i.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":1,"./adler32":3,"./crc32":5,"./inffast":7,"./inftrees":9}],9:[function(e,t,i){"use strict";var I=e("../utils/common"),D=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],T=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],U=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],F=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];t.exports=function(e,t,i,n,a,r,o,s){var f,l,d,c,u,h,b,m,w,k=s.bits,_=0,g=0,v=0,p=0,x=0,y=0,S=0,E=0,Z=0,B=0,A=null,z=0,R=new I.Buf16(16),N=new I.Buf16(16),O=null,C=0;for(_=0;_<=15;_++)R[_]=0;for(g=0;g<n;g++)R[t[i+g]]++;for(x=k,p=15;1<=p&&0===R[p];p--);if(p<x&&(x=p),0===p)return a[r++]=20971520,a[r++]=20971520,s.bits=1,0;for(v=1;v<p&&0===R[v];v++);for(x<v&&(x=v),_=E=1;_<=15;_++)if(E<<=1,(E-=R[_])<0)return-1;if(0<E&&(0===e||1!==p))return-1;for(N[1]=0,_=1;_<15;_++)N[_+1]=N[_]+R[_];for(g=0;g<n;g++)0!==t[i+g]&&(o[N[t[i+g]]++]=g);if(0===e?(A=O=o,h=19):1===e?(A=D,z-=257,O=T,C-=257,h=256):(A=U,O=F,h=-1),_=v,u=r,S=g=B=0,d=-1,c=(Z=1<<(y=x))-1,1===e&&852<Z||2===e&&592<Z)return 1;for(;;){for(b=_-S,o[g]<h?(m=0,w=o[g]):o[g]>h?(m=O[C+o[g]],w=A[z+o[g]]):(m=96,w=0),f=1<<_-S,v=l=1<<y;a[u+(B>>S)+(l-=f)]=b<<24|m<<16|w|0,0!==l;);for(f=1<<_-1;B&f;)f>>=1;if(0!==f?(B&=f-1,B+=f):B=0,g++,0==--R[_]){if(_===p)break;_=t[i+o[g]]}if(x<_&&(B&c)!==d){for(0===S&&(S=x),u+=v,E=1<<(y=_-S);y+S<p&&!((E-=R[y+S])<=0);)y++,E<<=1;if(Z+=1<<y,1===e&&852<Z||2===e&&592<Z)return 1;a[d=B&c]=x<<24|y<<16|u-r|0}}return 0!==B&&(a[u+B]=_-S<<24|64<<16|0),s.bits=x,0}},{"../utils/common":1}],10:[function(e,t,i){"use strict";t.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],11:[function(e,t,i){"use strict";t.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],"/lib/inflate.js":[function(e,t,i){"use strict";var c=e("./zlib/inflate"),u=e("./utils/common"),h=e("./utils/strings"),b=e("./zlib/constants"),n=e("./zlib/messages"),a=e("./zlib/zstream"),r=e("./zlib/gzheader"),m=Object.prototype.toString;function o(e){if(!(this instanceof o))return new o(e);this.options=u.assign({chunkSize:16384,windowBits:0,to:""},e||{});var t=this.options;t.raw&&0<=t.windowBits&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(0<=t.windowBits&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),15<t.windowBits&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new a,this.strm.avail_out=0;var i=c.inflateInit2(this.strm,t.windowBits);if(i!==b.Z_OK)throw new Error(n[i]);if(this.header=new r,c.inflateGetHeader(this.strm,this.header),t.dictionary&&("string"==typeof t.dictionary?t.dictionary=h.string2buf(t.dictionary):"[object ArrayBuffer]"===m.call(t.dictionary)&&(t.dictionary=new Uint8Array(t.dictionary)),t.raw&&(i=c.inflateSetDictionary(this.strm,t.dictionary))!==b.Z_OK))throw new Error(n[i])}function s(e,t){var i=new o(t);if(i.push(e,!0),i.err)throw i.msg||n[i.err];return i.result}o.prototype.push=function(e,t){var i,n,a,r,o,s=this.strm,f=this.options.chunkSize,l=this.options.dictionary,d=!1;if(this.ended)return!1;n=t===~~t?t:!0===t?b.Z_FINISH:b.Z_NO_FLUSH,"string"==typeof e?s.input=h.binstring2buf(e):"[object ArrayBuffer]"===m.call(e)?s.input=new Uint8Array(e):s.input=e,s.next_in=0,s.avail_in=s.input.length;do{if(0===s.avail_out&&(s.output=new u.Buf8(f),s.next_out=0,s.avail_out=f),(i=c.inflate(s,b.Z_NO_FLUSH))===b.Z_NEED_DICT&&l&&(i=c.inflateSetDictionary(this.strm,l)),i===b.Z_BUF_ERROR&&!0===d&&(i=b.Z_OK,d=!1),i!==b.Z_STREAM_END&&i!==b.Z_OK)return this.onEnd(i),!(this.ended=!0);s.next_out&&(0!==s.avail_out&&i!==b.Z_STREAM_END&&(0!==s.avail_in||n!==b.Z_FINISH&&n!==b.Z_SYNC_FLUSH)||("string"===this.options.to?(a=h.utf8border(s.output,s.next_out),r=s.next_out-a,o=h.buf2string(s.output,a),s.next_out=r,s.avail_out=f-r,r&&u.arraySet(s.output,s.output,a,r,0),this.onData(o)):this.onData(u.shrinkBuf(s.output,s.next_out)))),0===s.avail_in&&0===s.avail_out&&(d=!0)}while((0<s.avail_in||0===s.avail_out)&&i!==b.Z_STREAM_END);return i===b.Z_STREAM_END&&(n=b.Z_FINISH),n===b.Z_FINISH?(i=c.inflateEnd(this.strm),this.onEnd(i),this.ended=!0,i===b.Z_OK):n!==b.Z_SYNC_FLUSH||(this.onEnd(b.Z_OK),!(s.avail_out=0))},o.prototype.onData=function(e){this.chunks.push(e)},o.prototype.onEnd=function(e){e===b.Z_OK&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=u.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},i.Inflate=o,i.inflate=s,i.inflateRaw=function(e,t){return(t=t||{}).raw=!0,s(e,t)},i.ungzip=s},{"./utils/common":1,"./utils/strings":2,"./zlib/constants":4,"./zlib/gzheader":6,"./zlib/inflate":8,"./zlib/messages":10,"./zlib/zstream":11}]},{},[])("/lib/inflate.js")});
