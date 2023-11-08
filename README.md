# Serverless Silos

A reference architecture using services such as CDK and Lambda to demonstrate a hands-on approach to implementing Serverless Silos.

This was demonstrated at AWS Summit ANZ 2023: Simplify multi-tenant microservice applications - https://www.youtube.com/watch?v=upfYIB6Rz0o



<p align="center">
  <img src="/img/architecture.png" />
</p>

> :warning: This artifact deploys a **public API** resource and should be **deleted** when not in use or a form of **authentication should be added** to the API. You are responsible for the costs associated with deploying this project, it is recommended to **destroy the stack when not in use**.

### Solution Overview

#### Infrastructure Deployment

<p align="center">
  <img src="/img/template_synth.png" width="500"/>
</p>

CDK is used to define the infrastructure as code and synthesize CloudFormation templates. The templates are then stored in an S3 bucket for deployment. 

To deploy the CDK application:

1. Clone this repository
2. Run `cdk bootstrap` to setup CDK toolkit stack
3. Run `cdk deploy` to deploy the stack (assuming you have AWS credentials in your environment)

#### Tenant Control Plane

The tenant control plane manages tenant lifecycle via API Gateway. Lambda functions handle tenant onboarding/offboarding. DynamoDB stores the state of all tenancies and streams changes to trigger provisioning. Step Functions can be used to orchestrate the provisioning of new tenancies based on DynamoDB state.

**Note**: In the example code the Step Function has been replaced with a single deployment lambda. If you have a multi step deployment process you should use a Step Function to orchestrate it.

<p align="center">
  <img src="/img/tenant_control_plane.png" width="800"/>
</p>

#### Tenant Deployment

 The onboarding Lambda retrieves templates from S3, populates parameters, and calls CloudFormation to deploy tenant resources. 

 <p align="center">
  <img src="/img/tenant_deployment.png" width="800"/>
</p>

An example tenant stack is then deployed with DynamoDB table, Lambda function, and permissions.

To create, update or delete tenants use the endpoints outlined below.

## Deployed Endpoints

#### Fetch Tenants
**HTTP Method**: GET
**Endpoint**: /tenants
**Description**: Retrieves a list of all tenant records from the system.
**Request**: No request body required.
**Response**: An array of tenant objects in JSON format.

```json
[
    {
        "tenantName": "silo_tenant",
        "status": "running",
        "tenantId": "12345678-1234-1234-1234-123456789100",
        "created": "1600000000.000000000000000000000",
        "deploymentType": "silo",
        "tenantSafeName": "silo_tenant"
    }
    ...
]
```


#### Create Tenant

**HTTP Method**: POST
**Endpoint**: /onboarding
**Description**: Onboards a new tenant with a specified name and deployment type.
**Request Body**:


```json
{
  "tenantName": "string",
  "deploymentType": "string"
}
```


#### Delete Tenant

**HTTP Method**: POST
**Endpoint**: /delete
**Description**: Deletes an existing tenant based on the provided tenant information.
**Request Body**:

```json
{
  "tenantName": "string",
  "tenantId": "string"
}
```

#### Get Tenant Information

**HTTP Method**: POST
**Endpoint**: /tenant-info
**Description**: Retrieves detailed information for a specific tenant CloudFormation deployment using the tenant's ID.
**Request Body**:

```json
[
    {
        "LogicalResourceId": "LambdaTenantSilo123456",
        "PhysicalResourceId": "12345678-1234-1234-1234-123456789100",
        "ResourceType": "AWS::Lambda::Function",
        "LastUpdatedTimestamp": "2000-01-01 00:00:00.000000+00:00",
        "ResourceStatus": "CREATE_COMPLETE",
        "DriftInformation": { "StackResourceDriftStatus": "NOT_CHECKED" }
    }
]
```


## Useful commands
 * `cdk synth`       emits the synthesized CloudFormation template
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk destroy`     destroy this stack and remove resources from your AWS account


## License

This library is licensed under the [MIT-0](https://github.com/aws/mit-0) license. For more details, please see [LICENSE](LICENSE) file

## Legal disclaimer

Sample code, software libraries, command line tools, proofs of concept, templates, or other related technology are provided as AWS Content or Third-Party Content under the AWS Customer Agreement, or the relevant written agreement between you and AWS (whichever applies). You should not use this AWS Content or Third-Party Content in your production accounts, or on production or other critical data. You are responsible for testing, securing, and optimizing the AWS Content or Third-Party Content, such as sample code, as appropriate for production grade use based on your specific quality control practices and standards. Deploying AWS Content or Third-Party Content may incur AWS charges for creating or using AWS chargeable resources, such as running Amazon EC2 instances or using Amazon S3 storage.