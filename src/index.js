// Define module using Universal Module Definition pattern
// https://github.com/umdjs/umd/blob/master/returnExports.js

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['d3', 'vega', 'vegalite', 'lodash', 'visgen', 'visrank'],factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory(
      require('d3'),
      require('vega'),
      require('vegalite'),
      require('lodash'),
      require('visgen'),
      require('visrank')
    );
  } else {
    // Browser globals (root is window)
    factory(root.d3, root.vg, root.vl, root._, root.vgn, root.visrank);
  }
}(this, function(d3, vg, vl, _, vgn, visrank){
  var schema, col_indices;

  var keys = vg.keys;

  //TODO: unify type system
  function getDVType(data_type){
    //return datavore's data type
    //var typeMap = {
    //  "categorical": dv.type.nominal,
    //  "date": dv.type.nominal, //TODO extend datavore to support date
    //  "geographic": dv.type.nominal, //TODO: extend datavore to support geographic
    //  "quantitative": dv.type.numeric,
    //  "count": dv.type.unknown //TODO how to best deal with this.
    //};

    // return vegalite's data type
    var typeMap = {
      "categorical": "O",
      "geographic": "G",
      "quantitative": "Q",
      "date": "T" //TODO: refactor this to datetime
    };
    return typeMap[data_type];
  }

  // ----- load schema -----
  function loadSchema(){
    //TODO: use amd-plugin to load json, csv
    d3.json("data/birdstrikes/birdstrikes-schema.json", function(_schema) {
      //TODO: remove this line after updating csv.
      schema = _(_schema).filter(function(col){ return col.enabled; })
        .sortBy('field_name')
        .map(function(col, i){
          col.key = col['field_name'].replace(/(: )/g, "__").replace(/[\/ ]/g,"_").replace(/[()]/g, "");
          col.index = i; //add index
          return col;
        })
        .value();

      col_indices = _.reduce(schema, function(result, col, i){ result[col] = i; return result;}, {});

      console.log('schema keys', _.pluck(schema,'key').sort());
      console.log('data_types', _(schema).pluck('data_type').uniq().value());

      loadData();
    });
  }

  function encodingDetails(enc, div){
    div.append("div").html("marktype: <b>"+enc.marktype()+"</b>");
    enc.forEach(function(k, v){
      div.append("div").html(
        k+": <b>"+
        (v.aggr ? v.aggr+"-" : "") +
        (v.bin ? " bin " : "") +
        (v.name || "") +
        "</b> ("+ vl.dataTypeNames[v.type] + ")")
    });
  }

  function loadData(){
    // TODO: use other lib to load csv as columns?
    // TODO: regenerate csv with all columns
    d3.csv("data/birdstrikes/birdstrikes-header-reformatted.csv", function(data) {
      self.data = data;
      console.log("keys", vg.keys(data[0]));
      //console.log("data#0", data[0]);
      // -----  Assume User Selection here -----

      // 0:O "Aircraft: Airline/Operator"
      // 1:O "Aircraft: Make/Model"
      // 2:O "Airport: Name"
      // 3:Q "Cost: Other"
      // 4:Q "Cost: Repair"
      // 5:Q "Cost: Total $"
      // 6:O "Effect: Amount of damage"
      // 7:T "Flight Date"
      // 8:# "Number of Strikes"
      // 9:G "Origin State"
      // 10:Q "Speed (IAS) in knots"
      // 11:O "When: Phase of flight"
      // 12:O "When: Time of day"
      // 13:O "Wildlife: Size"
      // 14:O "Wildlife: Species"

      // TODO(kanitw): extend this to support query transformation

      var colIndicesSet = [
        [6,11,5], //CxCxQ
        [6,8], //Cx#
        [2,3], //C(Big)xQ
        [6, 10], //CxQ
        [10], //Q
        // [4,5], //QxQ
        // [7,8], //Dx#
        [6,5,4], //CxQxQ
        // [11,12,13], //OxOxO //FIXME
        //// [6,5,10] //CxQxQ //TODO: speed might be problematic
        //// [6,8,5] //Cx#xG
      ];

      var control = d3.select("#control");

      var dsel = control.append("select")
        .attr("class", "data")
        .style("width", "300px")
        .on("change", function(){
          var index = this.options[this.selectedIndex].value;
          render(colIndicesSet[index])
        })
        .selectAll("option").data(colIndicesSet)
        .enter().append("option")
          .attr("value", function(d, i){ return i;})
          .attr("selected", function(d,i){ return i==0? true : undefined;})
          .text(function(d, i){ return getTitle(d);});

      render(colIndicesSet[0])
    });
  }

  function getTitle(colIndices){
    var cols = colIndices.map(function(i){ return schema[i];});

    return cols.map(function(col){
      return col['field_name'] + " [" + col['data_type'][0] +"]";
    }).join(",");
  }

  function render(selectedColIndices){

    var selectedCols = selectedColIndices.map(function(i){ return schema[i];}),
      selectedColNames = _.pluck(selectedCols, 'field_name'),
      selectedColTypes = _.pluck(selectedCols, 'data_type');

    // ----- Generate Charts -----
    //TODO(kanitw): change schema format to match
    var fields = selectedCols.map(function(col){
      if(col.data_type == "count"){
        return {aggr: "count", type:"Q"};
      }
      var type = getDVType(col.data_type), f;
      switch(type){

        case "Q":
          f = {name: col.key, type: "Q", _aggr:"*"}
          return f;
        case "O":
        default:
          return {name: col.key, type:"O"};
      }
    });

    console.log('fields', JSON.stringify(fields));

    var aggr = vgn.genAggregate([], fields)
    console.log('aggregates', aggr.map(function(a){
      return JSON.stringify(a, null, "  ");
    }).join("\n\n"));

    //TODO(kanitw): generate a list of charts and rank
    var chartsByFieldset = self.charts = vgn.generateCharts(fields,
      null,
      {
        dataUrl: "data/birdstrikes.json",
        viewport: [460, 460]
      }
    );

    console.log("chartsByFieldset", chartsByFieldset);

    d3.select("#display").selectAll("*").remove();
    chartsByFieldset.forEach(renderCharts);
  }


  function renderCharts(charts, groupId) {
    var content = d3.select("#display");
    var visIdCounter=0;


    var fields = vl.vals(charts[0].enc);
    var groupname = fields.map(function(v){
      return (v.aggr ? v.aggr+"_" : "") +
        (v.bin ? "bin_" : "") +
        v.name +
        "(" + v.type + ")";
    }).join(" / ")

    content.append("h2").text(groupname);

    charts = charts.map(function(c){
      c.score = visrank.getScore(c);
      return c;
    });

    var diff = vgn.getDistanceTable(charts),
      clusters = vgn.cluster(charts, 2.5)
        .map(function(cluster){
          return cluster.sort(function(i, j){
            return charts[j].score - charts[i].score;
          });
        })
        .sort(function(c1, c2){
          return charts[c2[0]].score - charts[c1[0]].score;
        })


    console.log("clusters", clusters);

    var table = content.append("table");
    var headerRow = table.append("tr").attr("class", "header-row");
    headerRow.append("th");
    headerRow.selectAll("th.item-col").data(diff)
      .enter().append("th").attr("class", "item-col")
      .append("b").text(function (d, i) {
        return "" + i;
      });

    var rows = table.selectAll("tr.item-row")
      .data(diff)
      .enter().append("tr").attr("class", "item-row");

    rows.append("td").append("b").text(function (d, i) {
      return i;
    });
    rows.selectAll("td.item-cell")
      .data(_.identity)
      .enter().append("td").attr("class", "item-cell")
      .style("text-align", "center")
      .style("border", "1px solid #ddd")
      .text(function (d) {
        return d ? d3.format('.2')(d) : "-";
      });

    var HEIGHT_OFFSET = 60;

    clusters.forEach(function (clusterIndices) {
      var cluster = clusterIndices.map(function (i) {
        var chart = charts[i],
          encoding = vl.Encoding.parseJSON(chart),
          spec = vl.toVegaSpec(encoding, data);
        return {
          chart: chart,
          encoding: encoding,
          spec: spec,
          i: i
        };
      });

      var clusterHeight = cluster.reduce(function (h, c) {
        var nh = +c.spec.height + HEIGHT_OFFSET + 120;
        return nh > h ? nh : h;
      }, 0)

      var chartGroupDiv = content.append("div")
        .attr("id", "group")
        .attr("class", "row")
        .style({
          "background-color": "#fcfcfc",
          "overflow-x": "scroll",
          "overflow-y": "hidden",
          "margin-bottom": "20px",
          "white-space": "nowrap",
          "height": clusterHeight + "px"
        });

      cluster.forEach(function (o, i) {
        // console.log('chart', chart, chart.toShorthand());
        var chart = o.chart,
          i = o.i,
          id = 'vis-' + groupId + "-" + (visIdCounter++),
          encoding = o.encoding,
          spec = o.spec;

        var chartDiv = chartGroupDiv.append("div")
          .style({
            "display": "inline-block",
            "margin-right": "10px",
            "vertical-align": "top"
          })
        var detail = chartDiv.append("div").text("id:"+i+", score:"+chart.score).append("div");
        encodingDetails(encoding, detail);

        chartDiv.append("div")
          .attr("id", id)
          .style({"height": (+spec.height + HEIGHT_OFFSET) + "px", "overflow": "hidden"})

        chartDiv.append("div")
          .text(JSON.stringify(spec, null, "  "))
          .classed("hide spec", true);

        if (spec) {
          //console.log("rendering spec", spec);
          //console.log("rendering spec", id ,":", JSON.stringify(spec));
          vg.parse.spec(spec, function (vgChart) {
            var vis = vgChart({el: '#' + id, renderer: "svg"});
            vis.update();
          });
        }
      });
    })
  }


  loadSchema();
}));