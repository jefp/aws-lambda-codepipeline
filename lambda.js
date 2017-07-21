console.log('Loading function');

exports.handler = (eventC, context, callback) => {

  var AWS = require('aws-sdk');
  var ecs = new AWS.ECS({
    apiVersion: '2014-11-13'
  });
  var ecr = new AWS.ECR({
    apiVersion: '2015-09-21'
  });
  var codepipeline = new AWS.CodePipeline();
  var jobId = eventC["CodePipeline.job"].id;

  event = JSON.parse(eventC["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters);

  console.log('TaskName =', event.ecs_task_name);
  console.log('ECSClusterName =', event.ecs_cluster_name);
  console.log('ECSServiceName =', event.ecs_service_name);
  console.log('ECRRepositoryName =', event.ecr_repository_name);

  var ecs_task_name = event.ecs_task_name;
  var ecs_cluster_name = event.ecs_cluster_name;
  var ecs_service_name = event.ecs_service_name;
  var ecr_repository_name = event.ecr_repository_name;
  var tag = 'latest';
  var p_ecr = {
    repositoryName: ecr_repository_name,
    filter: {
      tagStatus: 'TAGGED'
    },
    imageIds: [{
      imageTag: 'latest'
    }]
  };

  // Notify AWS CodePipeline of a successful job
  var putJobSuccess = function(message) {
      var params = {
          jobId: jobId
      };
      codepipeline.putJobSuccessResult(params, function(err, data) {
          if(err) {
              context.fail(err);
          } else {
              context.succeed(message);
          }
      });
  };

  // Notify AWS CodePipeline of a failed job
  var putJobFailure = function(message) {
      var params = {
          jobId: jobId,
          failureDetails: {
              message: JSON.stringify(message),
              type: 'JobFailed',
              externalExecutionId: context.invokeid
          }
      };
      codepipeline.putJobFailureResult(params, function(err, data) {
          context.fail(message);
      });
  };



  ecr.describeImages(p_ecr, function(ecr_err, ecrData) {
    if (ecr_err) putJobFailure(err); // an error occurred
    else {
      image_tags = ecrData["imageDetails"][0]["imageTags"];
      image_tags.splice(image_tags.indexOf('latest'), 1);
      console.log(image_tags);
      tag = image_tags[0];

      var p_task = {
        taskDefinition: ecs_task_name
      };

      //GetCurrentTask
      ecs.describeTaskDefinition(p_task, function(err, data) {
        if (err) putJobFailure(err); // an error occurred
        else {
          var p_task_update = {
            "containerDefinitions": data["taskDefinition"]["containerDefinitions"],
            "family": data["taskDefinition"]["family"],
            "volumes": data["taskDefinition"]["volumes"],
            "networkMode": data["taskDefinition"]["networkMode"],
            "placementConstraints": data["taskDefinition"]["placementConstraints"]
          }

          image = p_task_update["containerDefinitions"][0]["image"];
          p_task_update["containerDefinitions"][0]["image"] = image.split(":")[0] + ":" + tag;


          //UpdateTask
          ecs.registerTaskDefinition(p_task_update, function(err, data) {
            if (err) putJobFailure(err); // an error occurred
            else {
              //UpdateService
              var p_service = {
                service: ecs_service_name,
                cluster: ecs_cluster_name,
                taskDefinition: ecs_task_name
              };
              ecs.updateService(p_service, function(err, data) {
                if (err) putJobFailure(err); // an error occurred
                else putJobSuccess(data);
              });
            }
          });
        }
      });
    }
  });
};
